import type { IntentBus } from '../core/bus'
import type { Command } from '../core/types'

export interface VoiceAdapterOptions {
  readonly bus: IntentBus
  /** Parsing is async because the model-backed path is; the grammar path resolves immediately. */
  readonly parse: (utterance: string) => Promise<Command>
  readonly onResult?: (utterance: string, cmd: Command) => void
}

/**
 * Turns a finished utterance into an intent. Voice never opens a transaction:
 * each utterance is a complete edit and its own undo step, which is what lets it
 * interleave with a gesture that is still in progress.
 */
export class VoiceAdapter {
  private readonly options: VoiceAdapterOptions

  constructor(options: VoiceAdapterOptions) {
    this.options = options
  }

  async handle(utterance: string): Promise<void> {
    const cmd = await this.options.parse(utterance)
    this.options.onResult?.(utterance, cmd)
    if (cmd.op === 'noop') return
    this.options.bus.emit(cmd, 'voice')
  }
}
