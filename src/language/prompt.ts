export type ModelAvailability = LanguageModelAvailability

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
