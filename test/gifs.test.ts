import { describe, expect, it } from 'vitest'
import { parseGifRequest } from '../src/language/gif-phrases'
import type { GifLibraryOptions } from '../src/media/gifs'
import { GifLibrary } from '../src/media/gifs'

function payload(count: number): unknown {
  return {
    data: Array.from({ length: count }, (_, i) => ({
      id: `g${String(i)}`,
      title: `gif ${String(i)}`,
      images: { downsized: { url: `https://example.test/${String(i)}.gif` } },
    })),
  }
}

/** A fetch that answers with a fixed body, so nothing here touches a network. */
function stub(body: unknown, ok = true): typeof globalThis.fetch {
  return () => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)
}

function failing(): typeof globalThis.fetch {
  return () => Promise.reject(new Error('offline'))
}

const library = (over: Partial<GifLibraryOptions> = {}): GifLibrary =>
  new GifLibrary({ key: 'test-key', fetch: stub(payload(4)), pick: () => 1, ...over })

describe('reading a gif phrase', () => {
  it('reads a search and its query', () => {
    expect(parseGifRequest('find a gif of a cat')).toEqual({ kind: 'search', query: 'cat' })
    expect(parseGifRequest('search gifs for explosions')).toEqual({
      kind: 'search',
      query: 'explosions',
    })
    expect(parseGifRequest('a gif of heavy rain')).toEqual({ kind: 'search', query: 'heavy rain' })
  })

  it('reads the browse verbs', () => {
    expect(parseGifRequest('change it')).toEqual({ kind: 'change' })
    expect(parseGifRequest('another one')).toEqual({ kind: 'change' })
    expect(parseGifRequest('next gif')).toEqual({ kind: 'change' })
    expect(parseGifRequest('randomize')).toEqual({ kind: 'shuffle' })
    expect(parseGifRequest('surprise me')).toEqual({ kind: 'shuffle' })
    expect(parseGifRequest('keep it')).toEqual({ kind: 'keep' })
  })

  // The whole reason `change` is anchored: it is also a property verb.
  it('leaves a property command alone', () => {
    expect(parseGifRequest('change the color to teal')).toBeNull()
    expect(parseGifRequest('change the width to 300')).toBeNull()
    expect(parseGifRequest('make it wider')).toBeNull()
    expect(parseGifRequest('')).toBeNull()
  })
})

describe('browsing gifs', () => {
  it('reports a missing key rather than failing', async () => {
    const empty = new GifLibrary({ key: undefined, fetch: stub(payload(2)) })
    expect(empty.configured).toBe(false)
    expect(await empty.search('cat')).toEqual({ outcome: 'unconfigured', gif: null })
  })

  it('returns the first result of a search', async () => {
    const response = await library().search('cat')
    expect(response.outcome).toBe('ok')
    expect(response.gif?.url).toBe('https://example.test/0.gif')
  })

  it('reports an empty result set', async () => {
    const none = new GifLibrary({ key: 'k', fetch: stub({ data: [] }) })
    expect(await none.search('nothing')).toEqual({ outcome: 'empty', gif: null })
  })

  it('reports an unreachable service', async () => {
    const dead = new GifLibrary({ key: 'k', fetch: failing() })
    expect(await dead.search('cat')).toEqual({ outcome: 'offline', gif: null })
  })

  it('ignores an entry with no usable url', async () => {
    const odd = new GifLibrary({
      key: 'k',
      fetch: stub({
        data: [
          { id: 'a', images: {} },
          { id: 'b', images: { original: { url: 'u' } } },
        ],
      }),
    })
    const response = await odd.search('cat')
    expect(response.gif?.url).toBe('u')
  })

  it('walks the results and wraps at the end', async () => {
    const gifs = library()
    await gifs.search('cat')
    expect(gifs.next().gif?.id).toBe('g1')
    expect(gifs.next().gif?.id).toBe('g2')
    expect(gifs.next().gif?.id).toBe('g3')
    expect(gifs.next().gif?.id).toBe('g0')
  })

  it('always moves when shuffling', async () => {
    const gifs = library()
    await gifs.search('cat')
    const first = gifs.shuffle().gif?.id
    expect(first).not.toBe('g0')
    expect(gifs.shuffle().gif?.id).not.toBe(first)
  })

  it('has nothing to browse before a search', () => {
    const gifs = library()
    expect(gifs.browsing).toBe(false)
    expect(gifs.next()).toEqual({ outcome: 'empty', gif: null })
  })

  it('ends the session when a gif is kept', async () => {
    const gifs = library()
    await gifs.search('cat')
    expect(gifs.browsing).toBe(true)
    gifs.keep()
    expect(gifs.browsing).toBe(false)
    expect(gifs.next().gif).toBeNull()
  })
})
