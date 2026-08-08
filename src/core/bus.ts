import type { Command, Intent, IntentSource } from './types'

export type IntentHandler = (intent: Intent) => void

/**
 * The single channel between input adapters and the store. Adapters know this
 * interface and nothing else, which is what lets pointer, hand, and voice share
 * one arbitration policy instead of three.
 */
export class IntentBus {
  private readonly handlers = new Set<IntentHandler>()
  private readonly clock: () => number

  constructor(clock: () => number = () => Date.now()) {
    this.clock = clock
  }

  subscribe(handler: IntentHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  dispatch(intent: Intent): void {
    this.deliver(intent)
  }

  /** Convenience for callers that only have a command and a source. */
  emit(cmd: Command, source: IntentSource, txn?: string): void {
    this.dispatch(
      txn === undefined
        ? { cmd, source, ts: this.clock() }
        : { cmd, source, txn, ts: this.clock() },
    )
  }

  protected deliver(intent: Intent): void {
    for (const handler of this.handlers) handler(intent)
  }
}
