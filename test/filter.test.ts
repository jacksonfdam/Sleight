import { describe, expect, it } from 'vitest'
import { OneEuroFilter } from '../src/vision/filter'

/** Samples a signal at 60Hz and returns the filtered output. */
function run(signal: (index: number) => number, samples: number): number[] {
  const filter = new OneEuroFilter()
  const out: number[] = []
  for (let i = 0; i < samples; i += 1) out.push(filter.filter(signal(i), i * (1000 / 60)))
  return out
}

function spread(values: readonly number[]): number {
  return Math.max(...values) - Math.min(...values)
}

describe('one euro filter', () => {
  it('passes the first sample through unchanged', () => {
    const filter = new OneEuroFilter()
    expect(filter.filter(0.42, 0)).toBeCloseTo(0.42, 6)
  })

  it('damps jitter around a stationary point', () => {
    const noise = (i: number) => 100 + (i % 2 === 0 ? 1.5 : -1.5)
    const filtered = run(noise, 120).slice(30)
    expect(spread(filtered)).toBeLessThan(spread([98.5, 101.5]) / 3)
  })

  it('keeps up with a fast sweep instead of trailing behind', () => {
    const ramp = (i: number) => i * 12
    const filtered = run(ramp, 90)
    const last = filtered.at(-1) ?? 0
    const target = 89 * 12
    // Within a couple of samples of the input, not a fixed fraction of it.
    expect(target - last).toBeLessThan(12 * 3)
  })

  it('smooths a still hand harder than a moving one', () => {
    const still = run(i => 100 + (i % 2 === 0 ? 1 : -1), 120).slice(40)
    const moving = run(i => i * 12 + (i % 2 === 0 ? 1 : -1), 120).slice(40)
    const stillStep = spread(still.slice(0, 4))
    const movingStep = Math.abs((moving[1] ?? 0) - (moving[0] ?? 0))
    expect(stillStep).toBeLessThan(movingStep)
  })

  it('forgets its history on reset', () => {
    const filter = new OneEuroFilter()
    for (let i = 0; i < 60; i += 1) filter.filter(100, i * 16)
    filter.reset()
    expect(filter.filter(5, 0)).toBeCloseTo(5, 6)
  })
})
