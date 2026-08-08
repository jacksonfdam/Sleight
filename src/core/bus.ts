import { LockTable, keyFor } from './locks'
import type { Command, Intent, IntentSource } from './types'

export type IntentHandler = (intent: Intent) => void

export interface IntentBusOptions {
  readonly clock?: () => number
  readonly locks?: LockTable
}

/**
 * The single channel between input adapters and the store. Adapters know this
 * interface and nothing else, which is what lets pointer, hand, and voice share
 * one arbitration policy instead of three.
 */
export class IntentBus {
  private readonly handlers = new Set<IntentHandler>()
  private readonly deferred: Intent[] = []
  private readonly locks: LockTable
  private readonly clock: () => number

  constructor(options: IntentBusOptions = {}) {
    this.clock = options.clock ?? (() => Date.now())
    this.locks = options.locks ?? new LockTable(this.clock)
  }

  subscribe(handler: IntentHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  /**
   * An intent either lands immediately, waits for a lock, or is discarded.
   * Voice waits because an utterance is expensive to produce and the speaker
   * will not repeat it; pointer and hand samples are discarded because another
   * one arrives a frame later.
   */
  dispatch(intent: Intent): void {
    const key = keyFor(intent.cmd)
    if (key === null) {
      this.deliver(intent)
      return
    }

    if (intent.txn === undefined) {
      if (this.locks.holder(key) === undefined) this.deliver(intent)
      else this.block(intent)
      return
    }

    if (this.locks.acquire(key, intent.txn)) this.deliver(intent)
    else this.block(intent)
  }

  /** Convenience for callers that only have a command and a source. */
  emit(cmd: Command, source: IntentSource, txn?: string): void {
    this.dispatch(
      txn === undefined
        ? { cmd, source, ts: this.clock() }
        : { cmd, source, txn, ts: this.clock() },
    )
  }

  /** Releases the transaction's locks and lets anything waiting on them through. */
  endTransaction(txn: string): void {
    this.locks.release(txn)
    this.drain()
  }

  /** Number of voice intents currently waiting on a lock. */
  pendingCount(): number {
    return this.deferred.length
  }

  private block(intent: Intent): void {
    if (intent.source === 'voice') this.deferred.push(intent)
  }

  private drain(): void {
    if (this.deferred.length === 0) return
    const waiting = this.deferred.splice(0, this.deferred.length)
    for (const intent of waiting) this.dispatch(intent)
  }

  private deliver(intent: Intent): void {
    for (const handler of this.handlers) handler(intent)
  }
}
