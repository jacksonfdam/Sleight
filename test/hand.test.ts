// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { HandAdapter } from '../src/adapters/hand'
import type { HandWorkerLike } from '../src/adapters/hand'
import { IntentBus } from '../src/core/bus'
import { createBlock, emptyDocument } from '../src/core/document'
import { reduce } from '../src/core/reducer'
import { Store } from '../src/core/store'
import type { Intent } from '../src/core/types'
import { HAND_ACTIVE_MARGIN, HAND_CONFIDENCE_MIN, PINCH_CLOSE, PINCH_OPEN } from '../src/tuning'
import type { HandRequest } from '../src/vision/hand.worker'

/** Accepts messages and never answers; every sample is injected by hand. */
class SilentWorker implements HandWorkerLike {
  readonly sent: HandRequest[] = []
  onmessage: ((event: MessageEvent) => void) | null = null

  postMessage(message: HandRequest): void {
    this.sent.push(message)
  }
  terminate(): void {
    // Nothing to release.
  }
}

/** A canvas-sized surface at a known screen position. */
function surface(): HTMLElement {
  const element = document.createElement('div')
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
      right: 1000,
      bottom: 1000,
      x: 0,
      y: 0,
    }) as DOMRect
  document.body.append(element)
  return element
}

describe('hand gesture mapping', () => {
  let bus: IntentBus
  let store: Store
  let adapter: HandAdapter
  let seen: Intent[]
  let hovered: string | null

  beforeEach(() => {
    const doc = reduce(emptyDocument(), {
      op: 'insert',
      parent: 'root',
      index: 0,
      block: createBlock('hero', 'hero', 'Hero', { x: 0, y: 0, w: 400, h: 200 }),
    })
    bus = new IntentBus()
    store = new Store(doc)
    seen = []
    hovered = 'hero'
    bus.subscribe(intent => {
      seen.push(intent)
      store.apply(intent.cmd, intent.txn, intent.ts)
    })
    adapter = new HandAdapter({
      bus,
      worker: new SilentWorker(),
      surface: surface(),
      wasmPath: '/models/wasm',
      modelPath: '/models/hand_landmarker.task',
      getHovered: () => hovered,
    })
  })

  const sample = (x: number, y: number, pinch: number, confidence = 1): void => {
    adapter.receive({ type: 'sample', x, y, pinch, confidence })
  }

  it('hides the cursor below the confidence floor', () => {
    sample(0.5, 0.5, 1, HAND_CONFIDENCE_MIN - 0.01)
    expect(adapter.cursor.visible).toBe(false)
    expect(seen).toHaveLength(0)
  })

  it('shows the cursor once tracking is confident', () => {
    sample(0.5, 0.5, 1, HAND_CONFIDENCE_MIN)
    expect(adapter.cursor.visible).toBe(true)
  })

  it('stretches the usable middle of the frame across the whole surface', () => {
    sample(HAND_ACTIVE_MARGIN, 1 - HAND_ACTIVE_MARGIN, 1)
    expect(adapter.cursor.x).toBeCloseTo(0, 5)
    expect(adapter.cursor.y).toBeCloseTo(1000, 5)
  })

  it('holds the pinch through the noisy band between the thresholds', () => {
    sample(0.5, 0.5, 1)
    sample(0.5, 0.5, PINCH_CLOSE - 0.005)
    expect(adapter.cursor.pinching).toBe(true)

    // Between close and open: a single threshold would drop the grab here.
    sample(0.5, 0.5, (PINCH_CLOSE + PINCH_OPEN) / 2)
    expect(adapter.cursor.pinching).toBe(true)

    sample(0.5, 0.5, PINCH_OPEN + 0.005)
    expect(adapter.cursor.pinching).toBe(false)
  })

  it('does not grab until the tighter threshold is crossed', () => {
    sample(0.5, 0.5, 1)
    sample(0.5, 0.5, (PINCH_CLOSE + PINCH_OPEN) / 2)
    expect(adapter.cursor.pinching).toBe(false)
  })

  it('selects and drags the hovered block, then releases', () => {
    sample(0.5, 0.5, 1)
    sample(0.5, 0.5, PINCH_CLOSE - 0.01)
    expect(store.getState().selectedId).toBe('hero')

    sample(0.55, 0.5, PINCH_CLOSE - 0.01)
    expect(store.getState().doc.blocks['hero']?.props.x).toBeGreaterThan(0)

    const txns = new Set(seen.filter(i => i.txn !== undefined).map(i => i.txn))
    expect(txns.size).toBe(1)

    sample(0.55, 0.5, PINCH_OPEN + 0.02)
    expect(bus.lockedBlock('geom')).toBeNull()
  })

  it('collapses a whole pinch drag into one undo step', () => {
    sample(0.5, 0.5, 1)
    sample(0.5, 0.5, PINCH_CLOSE - 0.01)
    for (let i = 1; i <= 8; i += 1) sample(0.5 + i * 0.01, 0.5, PINCH_CLOSE - 0.01)
    sample(0.6, 0.5, PINCH_OPEN + 0.02)

    const moved = store.getState().doc.blocks['hero']?.props.x ?? 0
    expect(moved).toBeGreaterThan(0)
    store.undo()
    expect(store.getState().doc.blocks['hero']?.props.x).toBe(0)
  })

  it('opens no transaction when the pinch lands on empty canvas', () => {
    hovered = null
    sample(0.5, 0.5, 1)
    sample(0.5, 0.5, PINCH_CLOSE - 0.01)
    sample(0.6, 0.5, PINCH_CLOSE - 0.01)
    expect(store.getState().selectedId).toBeNull()
    expect(seen.every(intent => intent.txn === undefined)).toBe(true)
  })

  it('releases the grab when tracking is lost mid drag', () => {
    sample(0.5, 0.5, 1)
    sample(0.5, 0.5, PINCH_CLOSE - 0.01)
    sample(0.5, 0.5, PINCH_CLOSE - 0.01, 0)
    expect(adapter.cursor.visible).toBe(false)
    expect(bus.lockedBlock('geom')).toBeNull()
  })

  it('reports dwell progress while the hand holds still', () => {
    sample(0.5, 0.5, 1)
    expect(adapter.cursor.dwell).toBe(0)
    sample(0.5, 0.5, 1)
    expect(adapter.cursor.dwell).toBeGreaterThanOrEqual(0)
    expect(adapter.cursor.dwell).toBeLessThanOrEqual(1)
  })
})
