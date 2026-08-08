import { MODEL_TIMEOUT_MS } from '../tuning'

export type ModelAvailability = LanguageModelAvailability

/**
 * The language the model is told to work in.
 *
 * Chrome warns when a request declares no output language, because it cannot
 * attest to output safety without one, and it degrades quality. The command
 * vocabulary is English, so English is the only honest answer here — declaring
 * anything else would ask the model to answer in a language the grammar behind
 * it cannot read.
 */
export const MODEL_LANGUAGE = 'en'

/** Declared identically on every call, so both draw the same configuration. */
const LANGUAGE_EXPECTATIONS = {
  expectedInputs: [{ type: 'text' as const, languages: [MODEL_LANGUAGE] }],
  expectedOutputs: [{ type: 'text' as const, languages: [MODEL_LANGUAGE] }],
}

/**
 * The model's only job is classification into the closed command vocabulary.
 * It never writes markup, styles, or prose; anything outside the vocabulary is
 * a no-op rather than an attempt.
 */
export const SYSTEM = `You convert an editing utterance into exactly one JSON command.
Allowed ops: set, nudge, insert, select, move, remove, center, scale, undo, redo, noop.
To centre a block on the canvas, output {"op":"center","id":"<id>","axis":"x"|"y"|"both"}.
To resize by a multiple, output {"op":"scale","id":"<id>","factor":<number>,"of":"box"|"font"}.
Allowed paths: color, fontSize, w, h, x, y, align, src, text.
Block types: section, hero, h1, h2, h3, h4, paragraph, text, image.
To add a block, output {"op":"insert","type":"<block type>"} and nothing else.
To choose a block, output {"op":"select","id":"<id from the block list>"}.
To delete a block, output {"op":"remove","id":"<id from the block list>"}.
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
    // The languages are declared here as well as on `create`. Availability is a
    // question about a specific configuration, and asking it without one draws
    // the same warning the session itself would.
    return await api.availability(LANGUAGE_EXPECTATIONS)
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
      /*
       * `temperature` and `topK` are deliberately absent. A classification task
       * wants the most deterministic sampling available, but Chrome has made
       * both parameters extension-only: passing them from a page changes
       * nothing and raises a deprecation warning. Determinism is instead
       * enforced after the fact — every response is narrowed to the command
       * union, and anything that fails falls through to the grammar, which is
       * deterministic by construction.
       */
      const base = await api.create({
        ...LANGUAGE_EXPECTATIONS,
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
