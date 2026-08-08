import type { Command, Intent, IntentSource } from './types'

/** How many entries are kept before the oldest are dropped. */
const LIMIT = 200

export interface LogEntry {
  readonly id: number
  readonly source: IntentSource
  readonly op: Command['op']
  /**
   * Rendered when the entry is recorded, not when it is drawn. A deletion has to
   * name the block it deleted, and by the time the panel repaints, that block is
   * gone from the document there would be to look it up in.
   */
  readonly text: string
  /** Present when the entry belongs to a continuous gesture. */
  readonly txn: string | undefined
  readonly ts: number
  /** How many commands this line stands for, once a gesture is collapsed. */
  readonly count: number
  /** Set for an utterance the grammar produced no command from. */
  readonly unheard: string | undefined
}

export interface HistoryLogOptions {
  /** Supplied by the caller, so the log itself never reads the document. */
  readonly describe: (cmd: Command) => string
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
  private readonly options: HistoryLogOptions
  private readonly entries: LogEntry[] = []
  private readonly listeners = new Set<(entries: readonly LogEntry[]) => void>()
  private next = 1

  constructor(options: HistoryLogOptions) {
    this.options = options
  }

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

    const text = this.options.describe(intent.cmd)
    const last = this.entries[this.entries.length - 1]
    if (
      last !== undefined &&
      intent.txn !== undefined &&
      last.txn === intent.txn &&
      last.op === intent.cmd.op
    ) {
      this.entries[this.entries.length - 1] = {
        ...last,
        text,
        ts: intent.ts,
        count: last.count + 1,
      }
      this.emit()
      return
    }

    this.push({
      id: this.next++,
      source: intent.source,
      op: intent.cmd.op,
      text,
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
      op: 'noop',
      text: utterance,
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
