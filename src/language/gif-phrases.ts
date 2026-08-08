/**
 * What a spoken GIF phrase is asking for. This is separate from the command
 * grammar because fulfilling it needs a network round trip, and the grammar is
 * deliberately pure and synchronous: it has to give the same answer offline,
 * under test, and in the browser.
 */
export type GifRequest =
  | { readonly kind: 'search'; readonly query: string }
  | { readonly kind: 'shuffle' }
  | { readonly kind: 'change' }
  | { readonly kind: 'keep' }

/**
 * How the word comes back from speech recognition.
 *
 * `gif` is a short word with no sentence around it to disambiguate, and every
 * engine hears it as something else: `gift` is by far the most common, `jif`
 * and `jiffy` follow. Listing them is not guessing — the surrounding shape
 * already fixes the meaning, and without them the feature simply cannot be
 * reached out loud.
 */
const GIF_WORD = '(?:gifs?|gifts?|jiffs?|jiffy|jifs?)'

const SEARCH = new RegExp(
  `^(?:find|search|search for|get|show|fetch|look up)(?: me)?(?: an?| some| the)? ${GIF_WORD}(?: of| for| about| with| showing)? (?<query>.+)$`,
)

const BARE_SEARCH = new RegExp(
  `^(?:an?|some|the) ${GIF_WORD}(?: of| for| about| with| showing) (?<query>.+)$`,
)

/**
 * Anchored to a whole utterance rather than a prefix. `change it` has to mean
 * the next GIF while `change the colour to red` stays a property command, and
 * the only reliable difference between them is that nothing follows the verb.
 */
const CHANGE = new RegExp(
  `^(?:change|swap|switch|replace)(?: it| that| this| the ${GIF_WORD}| the image| it out)?$` +
    `|^(?:another|another one|next|next one|next ${GIF_WORD}|try another|try again|not that one|different one)$`,
)

const SHUFFLE = new RegExp(
  `^(?:randomi[sz]e|shuffle|surprise me|random ${GIF_WORD}|any ${GIF_WORD})(?: it| the ${GIF_WORD}| the image)?$`,
)

const KEEP = /^(?:keep|keep it|keep that|keep this|keep that one|that one|stop|good|perfect)$/

function normalise(utterance: string): string {
  return utterance
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:please|okay|ok|hey|now|and) /, '')
    .trim()
}

/** Strips the leading article a query almost always starts with. */
function cleanQuery(raw: string): string {
  return raw.replace(/^(?:an?|the|some) /, '').trim()
}

export function parseGifRequest(utterance: string): GifRequest | null {
  const text = normalise(utterance)
  if (text.length === 0) return null

  const search = SEARCH.exec(text) ?? BARE_SEARCH.exec(text)
  const query = search?.groups?.['query']
  if (query !== undefined) {
    const cleaned = cleanQuery(query)
    return cleaned.length === 0 ? null : { kind: 'search', query: cleaned }
  }

  if (SHUFFLE.test(text)) return { kind: 'shuffle' }
  if (CHANGE.test(text)) return { kind: 'change' }
  if (KEEP.test(text)) return { kind: 'keep' }
  return null
}
