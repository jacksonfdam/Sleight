import { GIF_PAGE_SIZE, GIF_TIMEOUT_MS } from '../tuning'

export interface Gif {
  readonly id: string
  readonly url: string
  readonly title: string
}

/**
 * Why a request produced no picture. Every one of these is a state the editor
 * says out loud in the status bar, because a silent image that never changes is
 * indistinguishable from a command that was never heard.
 */
export type GifOutcome = 'ok' | 'unconfigured' | 'empty' | 'offline'

export interface GifResponse {
  readonly outcome: GifOutcome
  readonly gif: Gif | null
}

const ENDPOINT = 'https://api.giphy.com/v1/gifs/search'

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Reads one entry of a Giphy response. The downsized rendition is preferred and
 * the original is the fallback: a canvas block is a few hundred pixels wide, and
 * the original of a popular GIF is routinely several megabytes.
 */
function readGif(value: unknown): Gif | null {
  const record = asRecord(value)
  if (record === null) return null
  const id = record['id']
  if (typeof id !== 'string') return null

  const images = asRecord(record['images'])
  const url = ['downsized', 'fixed_width', 'original'].reduce<string | null>((found, name) => {
    if (found !== null) return found
    const candidate = asRecord(images?.[name])?.['url']
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
  }, null)
  if (url === null) return null

  const title = record['title']
  return { id, url, title: typeof title === 'string' && title.length > 0 ? title : 'GIF' }
}

function readGifs(payload: unknown): Gif[] {
  const data = asRecord(payload)?.['data']
  if (!Array.isArray(data)) return []
  const out: Gif[] = []
  for (const entry of data) {
    const gif = readGif(entry)
    if (gif !== null) out.push(gif)
  }
  return out
}

export interface GifLibraryOptions {
  /** Absent when no key was configured, which disables search rather than failing. */
  readonly key: string | undefined
  /** Injected so tests exercise the narrowing without reaching the network. */
  readonly fetch?: typeof globalThis.fetch
  /** Injected so a shuffle can be made deterministic under test. */
  readonly pick?: (count: number) => number
}

/**
 * One browsing session over a search result. It holds the last query and where
 * in its results the user is, so `change it` means the next candidate for the
 * same query rather than a fresh search that might return the same picture.
 *
 * This is the only part of the application that talks to a network service. It
 * is deliberately the last thing constructed and the first thing to degrade:
 * every method reports an outcome instead of throwing, so a missing key or a
 * dead connection costs the GIF feature and nothing else.
 */
export class GifLibrary {
  private readonly options: GifLibraryOptions
  private readonly request: typeof globalThis.fetch
  private results: Gif[] = []
  private index = 0
  private query = ''

  constructor(options: GifLibraryOptions) {
    this.options = options
    this.request = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  /** False when no key was configured, which the interface states plainly. */
  get configured(): boolean {
    return (this.options.key ?? '').length > 0
  }

  get lastQuery(): string {
    return this.query
  }

  async search(query: string): Promise<GifResponse> {
    const key = this.options.key
    if (key === undefined || key.length === 0) return { outcome: 'unconfigured', gif: null }

    const url = new URL(ENDPOINT)
    url.searchParams.set('api_key', key)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', String(GIF_PAGE_SIZE))
    // Keeps a work-safe result set, since the picture lands in a document.
    url.searchParams.set('rating', 'pg13')

    const payload = await this.get(url)
    if (payload === null) return { outcome: 'offline', gif: null }

    const gifs = readGifs(payload)
    if (gifs.length === 0) return { outcome: 'empty', gif: null }

    this.results = gifs
    this.query = query
    this.index = 0
    return { outcome: 'ok', gif: gifs[0] ?? null }
  }

  /** The next candidate for the current query, wrapping at the end. */
  next(): GifResponse {
    if (!this.configured) return { outcome: 'unconfigured', gif: null }
    if (this.results.length === 0) return { outcome: 'empty', gif: null }
    this.index = (this.index + 1) % this.results.length
    return { outcome: 'ok', gif: this.results[this.index] ?? null }
  }

  /** Any candidate but the one already showing, so a shuffle always moves. */
  shuffle(): GifResponse {
    if (!this.configured) return { outcome: 'unconfigured', gif: null }
    const count = this.results.length
    if (count === 0) return { outcome: 'empty', gif: null }
    if (count === 1) return { outcome: 'ok', gif: this.results[0] ?? null }

    const roll = this.options.pick ?? ((n: number) => Math.floor(Math.random() * n))
    const step = 1 + (roll(count - 1) % (count - 1))
    this.index = (this.index + step) % count
    return { outcome: 'ok', gif: this.results[this.index] ?? null }
  }

  /** Ends the session, so a later `change it` has nothing to advance through. */
  keep(): void {
    this.results = []
    this.index = 0
  }

  get browsing(): boolean {
    return this.results.length > 0
  }

  private async get(url: URL): Promise<unknown> {
    const controller = new AbortController()
    const timer = globalThis.setTimeout(() => {
      controller.abort()
    }, GIF_TIMEOUT_MS)
    try {
      const response = await this.request(url.toString(), { signal: controller.signal })
      if (!response.ok) return null
      return await (response.json() as Promise<unknown>)
    } catch {
      return null
    } finally {
      globalThis.clearTimeout(timer)
    }
  }
}
