import { LockTable, keyFor } from './locks'
import type { Command, Intent, IntentSource } from './types'

export type IntentHandler = (intent: Intent) => void

export interface IntentBusOptions {
  readonly clock?: () => number
  readonly locks?: LockTable
  /** Injected so tests can drive expiry without a real timer. */
  readonly setTimer?: (fn: () => void, ms: number) => number
  readonly clearTimer?: (handle: number) => void
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
  private readonly setTimer: (fn: () => void, ms: number) => number
  private readonly clearTimer: (handle: number) => void
  private sweepTimer: number | null = null

  constructor(options: IntentBusOptions = {}) {
    this.clock = options.clock ?? (() => Date.now())
    this.locks = options.locks ?? new LockTable(this.clock)
    this.setTimer = options.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms))
    this.clearTimer =
      options.clearTimer ??
      (handle => {
        globalThis.clearTimeout(handle)
      })
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

    if (this.locks.acquire(key, intent.txn)) {
      this.scheduleSweep()
      this.deliver(intent)
    } else {
      this.block(intent)
    }
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
    this.scheduleSweep()
  }

  /** Stops the expiry timer. Called when the editor tears down. */
  dispose(): void {
    if (this.sweepTimer !== null) this.clearTimer(this.sweepTimer)
    this.sweepTimer = null
    this.handlers.clear()
  }

  /** Number of voice intents currently waiting on a lock. */
  pendingCount(): number {
    return this.deferred.length
  }

  private block(intent: Intent): void {
    if (intent.source === 'voice') this.deferred.push(intent)
  }

  /**
   * A gesture that stops emitting — camera occlusion, a dropped pointer capture,
   * a closed tab — never calls `endTransaction`. Without this timer its lock
   * would hold and any deferred voice command would wait forever.
   */
  private scheduleSweep(): void {
    if (this.sweepTimer !== null) this.clearTimer(this.sweepTimer)
    const due = this.locks.nextExpiry()
    if (due === null) {
      this.sweepTimer = null
      return
    }
    const delay = Math.max(0, due - this.clock())
    this.sweepTimer = this.setTimer(() => {
      this.sweepTimer = null
      this.sweep()
    }, delay)
  }

  /** Drops expired leases and releases anything that was waiting on them. */
  sweep(): void {
    const freed = this.locks.sweep()
    if (freed.length > 0) this.drain()
    this.scheduleSweep()
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
