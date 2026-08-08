import { describe, expect, it } from 'vitest'
import { HoverDamper } from '../src/adapters/hover'
import { HOVER_DWELL_MS, HOVER_RELEASE_PX } from '../src/tuning'

describe('pointer hover', () => {
  it('commits immediately', () => {
    const damper = new HoverDamper()
    expect(damper.resolve({ id: 'hero', x: 10, y: 10, source: 'pointer', now: 0 })).toBe('hero')
    expect(damper.resolve({ id: 'intro', x: 12, y: 10, source: 'pointer', now: 1 })).toBe('intro')
  })

  it('clears immediately when the pointer leaves', () => {
    const damper = new HoverDamper()
    damper.resolve({ id: 'hero', x: 10, y: 10, source: 'pointer', now: 0 })
    expect(damper.resolve({ id: null, x: 10, y: 400, source: 'pointer', now: 1 })).toBeNull()
  })
})

/** Holds a block long enough for the hand path to commit it. */
function commit(damper: HoverDamper, id: string, x: number, y: number, now: number): string | null {
  damper.resolve({ id, x, y, source: 'hand', now })
  return damper.resolve({ id, x, y, source: 'hand', now: now + HOVER_DWELL_MS })
}

describe('hand hover', () => {
  it('requires a block to be held before committing it', () => {
    const damper = new HoverDamper()
    expect(damper.resolve({ id: 'hero', x: 0, y: 0, source: 'hand', now: 0 })).toBeNull()
    expect(
      damper.resolve({ id: 'hero', x: 0, y: 0, source: 'hand', now: HOVER_DWELL_MS - 1 }),
    ).toBeNull()
    expect(damper.resolve({ id: 'hero', x: 0, y: 0, source: 'hand', now: HOVER_DWELL_MS })).toBe(
      'hero',
    )
  })

  it('does not commit a block grazed in transit', () => {
    const damper = new HoverDamper()
    commit(damper, 'hero', 0, 0, 0)

    // Travelling across the canvas, clipping two blocks on the way.
    expect(damper.resolve({ id: 'middle', x: 60, y: 0, source: 'hand', now: 40 })).toBe('hero')
    expect(damper.resolve({ id: 'other', x: 120, y: 0, source: 'hand', now: 80 })).toBe('hero')
    expect(damper.resolve({ id: 'target', x: 180, y: 0, source: 'hand', now: 120 })).toBe('hero')
  })

  it('commits once a block is held long enough', () => {
    const damper = new HoverDamper()
    commit(damper, 'hero', 0, 0, 0)
    damper.resolve({ id: 'target', x: 100, y: 0, source: 'hand', now: 200 })
    expect(
      damper.resolve({ id: 'target', x: 102, y: 0, source: 'hand', now: 200 + HOVER_DWELL_MS }),
    ).toBe('target')
  })

  it('keeps the committed block while the point barely moves', () => {
    const damper = new HoverDamper()
    commit(damper, 'hero', 100, 100, 0)
    const jitter = HOVER_RELEASE_PX - 2
    expect(damper.resolve({ id: null, x: 100 + jitter, y: 100, source: 'hand', now: 500 })).toBe(
      'hero',
    )
  })

  it('releases once the point clears the block by the margin', () => {
    const damper = new HoverDamper()
    commit(damper, 'hero', 100, 100, 0)
    damper.resolve({ id: null, x: 100 + HOVER_RELEASE_PX * 3, y: 100, source: 'hand', now: 200 })
    expect(
      damper.resolve({
        id: null,
        x: 100 + HOVER_RELEASE_PX * 3,
        y: 100,
        source: 'hand',
        now: 200 + HOVER_DWELL_MS,
      }),
    ).toBeNull()
  })
})
