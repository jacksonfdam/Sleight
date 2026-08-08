import { MODEL_TIMEOUT_MS } from '../tuning'

export type ModelAvailability = LanguageModelAvailability

/**
 * The model's only job is classification into the closed command vocabulary.
 * It never writes markup, styles, or prose; anything outside the vocabulary is
 * a no-op rather than an attempt.
 */
export const SYSTEM = `You convert an editing utterance into exactly one JSON command.
Allowed ops: set, nudge, insert, move, remove, noop.
Allowed paths: color, fontSize, w, h, x, y, align, src, text.
Colors must be resolved to a hex string.
Output ONLY raw JSON. No prose, no markdown fences, no explanation.
If the utterance is not an editing command, output {"op":"noop"}.`

/**
 * The built-in prompt API is Chrome specific and, on Linux, present only in
 * official Google builds — a distribution Chromium reports `unavailable` no
 * matter what the hardware can do. Detection is therefore a runtime question,
 * never a user agent one.
 */
export async function detectLanguageModel(): Promise<ModelAvailability> {
  const api = globalThis.LanguageModel
  if (api === undefined) return 'unavailable'
  try {
    return await api.availability()
  } catch {
    return 'unavailable'
  }
}

/**
 * Owns one long-lived session and clones it per utterance. Cloning keeps each
 * request at the same context length: without it every previous edit would
 * accumulate in the window and the model would start answering from history
 * rather than from the utterance in front of it.
 */
export class PromptSession {
  private readonly base: LanguageModelSession

  private constructor(base: LanguageModelSession) {
    this.base = base
  }

  static async open(): Promise<PromptSession | null> {
    const api = globalThis.LanguageModel
    if (api === undefined) return null
    try {
      const base = await api.create({
        // Determinism matters more than variety for a classification task.
        temperature: 0.1,
        topK: 1,
        initialPrompts: [{ role: 'system', content: SYSTEM }],
      })
      return new PromptSession(base)
    } catch {
      return null
    }
  }

  /** Returns the raw model output, or null on timeout or failure. */
  async run(input: string): Promise<string | null> {
    const controller = new AbortController()
    const timer = globalThis.setTimeout(() => {
      controller.abort()
    }, MODEL_TIMEOUT_MS)
    try {
      const clone = await this.base.clone({ signal: controller.signal })
      try {
        return await clone.prompt(input, { signal: controller.signal })
      } finally {
        clone.destroy()
      }
    } catch {
      return null
    } finally {
      globalThis.clearTimeout(timer)
    }
  }

  close(): void {
    this.base.destroy()
  }
}
