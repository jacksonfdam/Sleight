import { beforeEach, describe, expect, it } from 'vitest'
import { IntentBus } from '../src/core/bus'
import { createBlock, emptyDocument } from '../src/core/document'
import { GROUP, LockTable, keyFor, lockKey } from '../src/core/locks'
import { reduce } from '../src/core/reducer'
import { Store } from '../src/core/store'
import type { DocumentState, Intent } from '../src/core/types'
import { LOCK_TTL_MS } from '../src/tuning'

/** A hand-wound clock and timer queue, so expiry is exercised without waiting. */
class Harness {
  now = 0
  private readonly timers = new Map<number, { due: number; fn: () => void }>()
  private nextHandle = 1

  readonly clock = (): number => this.now
  readonly setTimer = (fn: () => void, ms: number): number => {
    const handle = this.nextHandle++
    this.timers.set(handle, { due: this.now + ms, fn })
    return handle
  }
  readonly clearTimer = (handle: number): void => {
    this.timers.delete(handle)
  }

  advance(ms: number): void {
    this.now += ms
    for (const [handle, timer] of [...this.timers]) {
      if (timer.due <= this.now) {
        this.timers.delete(handle)
        timer.fn()
      }
    }
  }
}

function seed(): DocumentState {
  return reduce(emptyDocument(), {
    op: 'insert',
    parent: 'root',
    index: 0,
    block: createBlock('hero', 'hero', 'Hero', { x: 0, y: 0, w: 400, h: 200, color: '#111111' }),
  })
}

describe('property groups', () => {
  it('splits geometry, style, and content', () => {
    expect(GROUP.w).toBe('geom')
    expect(GROUP.color).toBe('style')
    expect(GROUP.text).toBe('content')
  })

  it('derives a key from the block and group', () => {
    expect(keyFor({ op: 'set', id: 'hero', path: 'color', value: '#008080' })).toBe(
      lockKey('hero', 'style'),
    )
    expect(keyFor({ op: 'nudge', id: 'hero', path: 'w', delta: 5 })).toBe(lockKey('hero', 'geom'))
  })

  it('reports no key for commands that contend for nothing', () => {
    expect(keyFor({ op: 'select', id: 'hero' })).toBeNull()
    expect(keyFor({ op: 'undo' })).toBeNull()
    expect(keyFor({ op: 'remove', id: 'hero' })).toBeNull()
  })
})

describe('lock table', () => {
  it('refuses a key held by another transaction', () => {
    const clock = { now: 0 }
    const locks = new LockTable(() => clock.now)
    expect(locks.acquire('hero:geom', 'a')).toBe(true)
    expect(locks.acquire('hero:geom', 'b')).toBe(false)
  })

  it('renews the lease for the holder', () => {
    const clock = { now: 0 }
    const locks = new LockTable(() => clock.now)
    locks.acquire('hero:geom', 'a')
    clock.now += LOCK_TTL_MS - 1
    expect(locks.acquire('hero:geom', 'a')).toBe(true)
    clock.now += LOCK_TTL_MS - 1
    expect(locks.holder('hero:geom')).toBe('a')
  })

  it('treats an expired lease as free', () => {
    const clock = { now: 0 }
    const locks = new LockTable(() => clock.now)
    locks.acquire('hero:geom', 'a')
    clock.now += LOCK_TTL_MS
    expect(locks.holder('hero:geom')).toBeUndefined()
    expect(locks.acquire('hero:geom', 'b')).toBe(true)
  })
})

describe('bus arbitration', () => {
  let harness: Harness
  let bus: IntentBus
  let store: Store
  let seen: Intent[]

  beforeEach(() => {
    harness = new Harness()
    bus = new IntentBus({
      clock: harness.clock,
      locks: new LockTable(harness.clock),
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    })
    store = new Store(seed())
    seen = []
    bus.subscribe(intent => {
      seen.push(intent)
      store.apply(intent.cmd, intent.txn, intent.ts)
    })
  })

  it('lands a pinch resize and a spoken colour change at the same moment', () => {
    // The defining scenario: a hand gesture holds geometry while an utterance
    // takes style. Neither waits on the other.
    bus.emit({ op: 'nudge', id: 'hero', path: 'w', delta: 20 }, 'hand', 'pinch-1')
    bus.emit({ op: 'set', id: 'hero', path: 'color', value: '#008080' }, 'voice')
    bus.emit({ op: 'nudge', id: 'hero', path: 'w', delta: 20 }, 'hand', 'pinch-1')

    const hero = store.getState().doc.blocks['hero']
    expect(hero?.props.w).toBe(440)
    expect(hero?.props.color).toBe('#008080')
    expect(bus.pendingCount()).toBe(0)
    expect(seen).toHaveLength(3)
  })

  it('defers a voice intent that targets a locked group', () => {
    bus.emit({ op: 'nudge', id: 'hero', path: 'w', delta: 20 }, 'hand', 'pinch-1')
    bus.emit({ op: 'set', id: 'hero', path: 'w', value: 900 }, 'voice')

    expect(bus.pendingCount()).toBe(1)
    expect(store.getState().doc.blocks['hero']?.props.w).toBe(420)

    bus.endTransaction('pinch-1')
    expect(bus.pendingCount()).toBe(0)
    expect(store.getState().doc.blocks['hero']?.props.w).toBe(900)
  })

  it('drops a competing pointer intent instead of queueing it', () => {
    bus.emit({ op: 'nudge', id: 'hero', path: 'x', delta: 10 }, 'hand', 'pinch-1')
    bus.emit({ op: 'nudge', id: 'hero', path: 'x', delta: 500 }, 'pointer', 'drag-1')

    expect(bus.pendingCount()).toBe(0)
    expect(store.getState().doc.blocks['hero']?.props.x).toBe(10)
  })

  it('drains deferred voice intents in order', () => {
    bus.emit({ op: 'nudge', id: 'hero', path: 'w', delta: 10 }, 'hand', 'pinch-1')
    bus.emit({ op: 'set', id: 'hero', path: 'w', value: 600 }, 'voice')
    bus.emit({ op: 'set', id: 'hero', path: 'w', value: 700 }, 'voice')

    expect(bus.pendingCount()).toBe(2)
    bus.endTransaction('pinch-1')
    expect(store.getState().doc.blocks['hero']?.props.w).toBe(700)
  })

  it('releases a lock whose gesture never ended', () => {
    bus.emit({ op: 'nudge', id: 'hero', path: 'w', delta: 10 }, 'hand', 'pinch-1')
    bus.emit({ op: 'set', id: 'hero', path: 'w', value: 512 }, 'voice')
    expect(bus.pendingCount()).toBe(1)

    // The gesture goes silent. The expiry timer, not a release, unblocks the queue.
    harness.advance(LOCK_TTL_MS)
    expect(bus.pendingCount()).toBe(0)
    expect(store.getState().doc.blocks['hero']?.props.w).toBe(512)
  })

  it('lets an unrelated block through while one is locked', () => {
    bus.emit({ op: 'nudge', id: 'hero', path: 'w', delta: 10 }, 'hand', 'pinch-1')
    bus.emit({ op: 'set', id: 'other', path: 'w', value: 100 }, 'voice')
    expect(bus.pendingCount()).toBe(0)
  })

  it('never blocks selection or undo', () => {
    bus.emit({ op: 'nudge', id: 'hero', path: 'w', delta: 10 }, 'hand', 'pinch-1')
    bus.emit({ op: 'select', id: 'hero' }, 'voice')
    expect(store.getState().selectedId).toBe('hero')
  })
})
