import type { Command, Intent, IntentSource } from './types'

/** How many entries are kept before the oldest are dropped. */
const LIMIT = 200

export interface LogEntry {
  readonly id: number
  readonly source: IntentSource
  readonly cmd: Command
  /** Present when the entry belongs to a continuous gesture. */
  readonly txn: string | undefined
  readonly ts: number
  /** How many commands this line stands for, once a gesture is collapsed. */
  readonly count: number
  /** Set for an utterance the grammar produced no command from. */
  readonly unheard: string | undefined
}

/**
 * An append-only record of what each input source asked for.
 *
 * It is deliberately not the undo stack. The store keeps transactions so it can
 * replay a document; this keeps utterances, no-ops, and undo itself, because the
 * question it answers is "what did I just do, and did it register" rather than
 * "what is the document now". A voice command that matched nothing is the single
 * most useful line in it, and the undo stack cannot have one.
 */
export class HistoryLog {
  private readonly entries: LogEntry[] = []
  private readonly listeners = new Set<(entries: readonly LogEntry[]) => void>()
  private next = 1

  get all(): readonly LogEntry[] {
    return this.entries
  }

  subscribe(listener: (entries: readonly LogEntry[]) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Records an intent. Commands sharing a transaction collapse onto the entry
   * already open for it, so a drag that emits sixty positions is one line
   * carrying a count rather than sixty lines nobody can read.
   */
  record(intent: Intent): void {
    if (intent.cmd.op === 'hover') return

    const last = this.entries[this.entries.length - 1]
    if (
      last !== undefined &&
      intent.txn !== undefined &&
      last.txn === intent.txn &&
      last.cmd.op === intent.cmd.op
    ) {
      this.entries[this.entries.length - 1] = {
        ...last,
        cmd: intent.cmd,
        ts: intent.ts,
        count: last.count + 1,
      }
      this.emit()
      return
    }

    this.push({
      id: this.next++,
      source: intent.source,
      cmd: intent.cmd,
      txn: intent.txn,
      ts: intent.ts,
      count: 1,
      unheard: undefined,
    })
  }

  /** An utterance that produced no command, which never reaches the bus. */
  recordUnheard(utterance: string, ts: number): void {
    this.push({
      id: this.next++,
      source: 'voice',
      cmd: { op: 'noop' },
      txn: undefined,
      ts,
      count: 1,
      unheard: utterance,
    })
  }

  clear(): void {
    this.entries.length = 0
    this.emit()
  }

  private push(entry: LogEntry): void {
    this.entries.push(entry)
    if (this.entries.length > LIMIT) this.entries.splice(0, this.entries.length - LIMIT)
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.entries)
  }
}
