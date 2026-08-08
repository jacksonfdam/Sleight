// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { HandAdapter } from '../src/adapters/hand'
import type { HandWorkerLike } from '../src/adapters/hand'
import { IntentBus } from '../src/core/bus'
import { createBlock, emptyDocument } from '../src/core/document'
import { reduce } from '../src/core/reducer'
import { Store } from '../src/core/store'
import type { Intent } from '../src/core/types'
import type { HandleName } from '../src/render/renderer'
import {
  HAND_ACTIVE_MARGIN,
  HAND_CONFIDENCE_MIN,
  PINCH_CLOSE,
  PINCH_OPEN,
  TWO_HAND_MIN_SPAN,
} from '../src/tuning'
import type { HandPoint, HandRequest } from '../src/vision/hand.worker'

const OPEN = PINCH_OPEN + 0.02
const SHUT = PINCH_CLOSE - 0.01
const SURFACE = 1000

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
      width: SURFACE,
      height: SURFACE,
      right: SURFACE,
      bottom: SURFACE,
      x: 0,
      y: 0,
    }) as DOMRect
  document.body.append(element)
  return element
}

function hand(
  label: 'Left' | 'Right',
  x: number,
  y: number,
  pinch: number,
  confidence = 1,
): HandPoint {
  return { label, x, y, pinch, confidence }
}

describe('hand gesture mapping', () => {
  let bus: IntentBus
  let store: Store
  let adapter: HandAdapter
  let seen: Intent[]
  let hovered: string | null
  let handle: HandleName | null

  beforeEach(() => {
    const doc = reduce(emptyDocument(), {
      op: 'insert',
      parent: 'root',
      index: 0,
      block: createBlock('hero', 'hero', 'Hero', { x: 100, y: 100, w: 400, h: 200 }),
    })
    bus = new IntentBus()
    store = new Store(doc)
    seen = []
    hovered = 'hero'
    handle = null
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
      getHandle: () => handle,
      getSelected: () => store.getState().selectedId,
      getBox: id => store.getState().doc.blocks[id]?.props ?? null,
    })
  })

  const send = (...hands: HandPoint[]): void => {
    adapter.receive({ type: 'sample', hands })
  }

  const hero = () => store.getState().doc.blocks['hero']?.props

  describe('one hand', () => {
    it('hides a hand below the confidence floor', () => {
      send(hand('Right', 0.5, 0.5, 1, HAND_CONFIDENCE_MIN - 0.01))
      expect(adapter.cursors).toHaveLength(0)
      expect(adapter.cursor).toBeNull()
    })

    it('stretches the usable middle of the frame across the whole surface', () => {
      send(hand('Right', HAND_ACTIVE_MARGIN, 1 - HAND_ACTIVE_MARGIN, 1))
      expect(adapter.cursor?.x).toBeCloseTo(0, 5)
      expect(adapter.cursor?.y).toBeCloseTo(SURFACE, 5)
    })

    it('holds the pinch through the noisy band between the thresholds', () => {
      send(hand('Right', 0.5, 0.5, 1))
      send(hand('Right', 0.5, 0.5, SHUT))
      expect(adapter.cursor?.pinching).toBe(true)

      // Between close and open: a single threshold would drop the grab here.
      send(hand('Right', 0.5, 0.5, (PINCH_CLOSE + PINCH_OPEN) / 2))
      expect(adapter.cursor?.pinching).toBe(true)

      send(hand('Right', 0.5, 0.5, OPEN))
      expect(adapter.cursor?.pinching).toBe(false)
    })

    it('moves the hovered block and collapses the drag into one undo step', () => {
      send(hand('Right', 0.5, 0.5, 1))
      send(hand('Right', 0.5, 0.5, SHUT))
      for (let i = 1; i <= 8; i += 1) send(hand('Right', 0.5 + i * 0.01, 0.5, SHUT))
      send(hand('Right', 0.6, 0.5, OPEN))

      expect(hero()?.x).toBeGreaterThan(100)
      store.undo()
      expect(hero()?.x).toBe(100)
    })

    it('resizes when the pinch closes over a handle', () => {
      handle = 'se'
      send(hand('Right', 0.5, 0.5, 1))
      send(hand('Right', 0.5, 0.5, SHUT))
      send(hand('Right', 0.6, 0.6, SHUT))

      expect(hero()?.w).toBeGreaterThan(400)
      expect(hero()?.h).toBeGreaterThan(200)
      expect(hero()?.x).toBe(100)
    })

    it('releases the grab when tracking is lost mid drag', () => {
      send(hand('Right', 0.5, 0.5, 1))
      send(hand('Right', 0.5, 0.5, SHUT))
      send()
      expect(adapter.cursors).toHaveLength(0)
      expect(bus.lockedBlock('geom')).toBeNull()
    })
  })

  describe('two hands', () => {
    const spread = TWO_HAND_MIN_SPAN * 2

    it('tracks both hands at once', () => {
      send(hand('Left', 0.4, 0.5, 1), hand('Right', 0.6, 0.5, 1))
      expect(adapter.cursors).toHaveLength(2)
      expect([...adapter.cursors].map(c => c.label).sort()).toEqual(['Left', 'Right'])
    })

    it('scales a block up as the hands move apart', () => {
      send(hand('Left', 0.5 - spread, 0.5, SHUT), hand('Right', 0.5 + spread, 0.5, SHUT))
      send(hand('Left', 0.5 - spread * 2, 0.5, SHUT), hand('Right', 0.5 + spread * 2, 0.5, SHUT))

      expect(adapter.transforming).toBe(true)
      expect(hero()?.w).toBeGreaterThan(400)
      expect(hero()?.h).toBeGreaterThan(200)
    })

    it('scales a block down as the hands come together', () => {
      send(hand('Left', 0.5 - spread * 2, 0.5, SHUT), hand('Right', 0.5 + spread * 2, 0.5, SHUT))
      send(hand('Left', 0.5 - spread, 0.5, SHUT), hand('Right', 0.5 + spread, 0.5, SHUT))

      expect(hero()?.w).toBeLessThan(400)
      expect(hero()?.h).toBeLessThan(200)
    })

    it('keeps the aspect ratio while scaling', () => {
      send(hand('Left', 0.5 - spread, 0.5, SHUT), hand('Right', 0.5 + spread, 0.5, SHUT))
      send(
        hand('Left', 0.5 - spread * 1.5, 0.5, SHUT),
        hand('Right', 0.5 + spread * 1.5, 0.5, SHUT),
      )

      const props = hero()
      expect((props?.w ?? 0) / (props?.h ?? 1)).toBeCloseTo(400 / 200, 1)
    })

    it('scales about the centre rather than a corner', () => {
      send(hand('Left', 0.5 - spread, 0.5, SHUT), hand('Right', 0.5 + spread, 0.5, SHUT))
      send(hand('Left', 0.5 - spread * 2, 0.5, SHUT), hand('Right', 0.5 + spread * 2, 0.5, SHUT))

      const props = hero()
      expect((props?.x ?? 0) + (props?.w ?? 0) / 2).toBeCloseTo(300, 0)
      expect((props?.y ?? 0) + (props?.h ?? 0) / 2).toBeCloseTo(200, 0)
    })

    it('pans the block when both hands travel together', () => {
      send(hand('Left', 0.4, 0.5, SHUT), hand('Right', 0.6, 0.5, SHUT))
      const before = hero()
      send(hand('Left', 0.5, 0.5, SHUT), hand('Right', 0.7, 0.5, SHUT))

      const after = hero()
      expect(after?.x).toBeGreaterThan(before?.x ?? 0)
      expect(after?.w).toBe(before?.w)
    })

    it('waits while the hands are too close to give a stable ratio', () => {
      const tiny = TWO_HAND_MIN_SPAN / 8
      send(hand('Left', 0.5 - tiny, 0.5, SHUT), hand('Right', 0.5 + tiny, 0.5, SHUT))
      expect(adapter.transforming).toBe(false)
      expect(hero()?.w).toBe(400)
    })

    it('collapses a whole two hand gesture into one undo step', () => {
      send(hand('Left', 0.5 - spread, 0.5, SHUT), hand('Right', 0.5 + spread, 0.5, SHUT))
      for (let i = 1; i <= 6; i += 1) {
        const step = spread * (1 + i * 0.1)
        send(hand('Left', 0.5 - step, 0.5, SHUT), hand('Right', 0.5 + step, 0.5, SHUT))
      }
      send(hand('Left', 0.3, 0.5, OPEN), hand('Right', 0.7, 0.5, OPEN))

      expect(hero()?.w).not.toBe(400)
      store.undo()
      expect(hero()?.w).toBe(400)
      expect(hero()?.h).toBe(200)
      expect(hero()?.x).toBe(100)
    })

    it('releases the transform when one hand opens', () => {
      send(hand('Left', 0.5 - spread, 0.5, SHUT), hand('Right', 0.5 + spread, 0.5, SHUT))
      expect(adapter.transforming).toBe(true)
      send(hand('Left', 0.5 - spread, 0.5, OPEN), hand('Right', 0.5 + spread, 0.5, SHUT))
      expect(adapter.transforming).toBe(false)
      expect(bus.lockedBlock('geom')).toBeNull()
    })

    it('falls back to the selection when the gesture starts off a block', () => {
      store.apply({ op: 'select', id: 'hero' })
      hovered = null
      send(hand('Left', 0.5 - spread, 0.5, SHUT), hand('Right', 0.5 + spread, 0.5, SHUT))
      send(hand('Left', 0.5 - spread * 2, 0.5, SHUT), hand('Right', 0.5 + spread * 2, 0.5, SHUT))
      expect(hero()?.w).toBeGreaterThan(400)
    })

    it('does nothing when nothing is hovered or selected', () => {
      hovered = null
      send(hand('Left', 0.5 - spread, 0.5, SHUT), hand('Right', 0.5 + spread, 0.5, SHUT))
      expect(adapter.transforming).toBe(false)
      expect(hero()?.w).toBe(400)
    })

    it('reports no dwell progress while two hands are tracked', () => {
      send(hand('Left', 0.4, 0.5, 1), hand('Right', 0.6, 0.5, 1))
      expect(adapter.cursors.every(c => c.dwell === 0)).toBe(true)
    })

    it('emits every intent of the gesture from the hand source', () => {
      send(hand('Left', 0.5 - spread, 0.5, SHUT), hand('Right', 0.5 + spread, 0.5, SHUT))
      send(hand('Left', 0.5 - spread * 2, 0.5, SHUT), hand('Right', 0.5 + spread * 2, 0.5, SHUT))
      expect(seen.every(intent => intent.source === 'hand')).toBe(true)
    })
  })
})
