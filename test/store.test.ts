import { describe, expect, it, vi } from 'vitest'
import { ROOT_ID, createBlock, emptyDocument } from '../src/core/document'
import { reduce } from '../src/core/reducer'
import { Store } from '../src/core/store'
import type { DocumentState } from '../src/core/types'

function seed(): DocumentState {
  let doc = emptyDocument()
  doc = reduce(doc, {
    op: 'insert',
    parent: ROOT_ID,
    index: 0,
    block: createBlock('hero', 'hero', 'Hero', { x: 0, y: 0, w: 400, h: 200 }),
  })
  doc = reduce(doc, {
    op: 'insert',
    parent: ROOT_ID,
    index: 1,
    block: createBlock('copy', 'text', 'Copy'),
  })
  return doc
}

describe('undo grouping', () => {
  it('collapses a whole gesture into one undo step', () => {
    const store = new Store(seed())
    for (let i = 0; i < 40; i += 1) {
      store.apply({ op: 'nudge', id: 'hero', path: 'x', delta: 1 }, 'drag-1', i)
    }
    expect(store.getState().doc.blocks['hero']?.props.x).toBe(40)

    store.undo()
    expect(store.getState().doc.blocks['hero']?.props.x).toBe(0)
    expect(store.getState().canUndo).toBe(false)
  })

  it('keeps separate transactions as separate steps', () => {
    const store = new Store(seed())
    store.apply({ op: 'nudge', id: 'hero', path: 'x', delta: 10 }, 'drag-1', 1)
    store.apply({ op: 'nudge', id: 'hero', path: 'y', delta: 10 }, 'drag-2', 2)

    store.undo()
    expect(store.getState().doc.blocks['hero']?.props.y).toBe(0)
    expect(store.getState().doc.blocks['hero']?.props.x).toBe(10)

    store.undo()
    expect(store.getState().doc.blocks['hero']?.props.x).toBe(0)
  })

  it('treats untagged commands as one step each', () => {
    const store = new Store(seed())
    store.apply({ op: 'set', id: 'hero', path: 'color', value: '#111111' })
    store.apply({ op: 'set', id: 'hero', path: 'color', value: '#222222' })

    store.undo()
    expect(store.getState().doc.blocks['hero']?.props.color).toBe('#111111')
  })

  it('undoes a voice command issued mid-gesture without rewinding the gesture', () => {
    const store = new Store(seed())
    store.apply({ op: 'nudge', id: 'hero', path: 'w', delta: 20 }, 'pinch-1', 1)
    store.apply({ op: 'set', id: 'hero', path: 'color', value: '#008080' }, 'voice-1', 2)
    store.apply({ op: 'nudge', id: 'hero', path: 'w', delta: 20 }, 'pinch-1', 3)

    expect(store.getState().doc.blocks['hero']?.props.w).toBe(440)
    expect(store.getState().doc.blocks['hero']?.props.color).toBe('#008080')

    store.undo()
    const after = store.getState().doc.blocks['hero']
    expect(after?.props.color).not.toBe('#008080')
    expect(after?.props.w).toBe(440)
  })

  it('redoes a transaction that was undone', () => {
    const store = new Store(seed())
    store.apply({ op: 'nudge', id: 'hero', path: 'x', delta: 30 }, 'drag-1', 1)
    store.undo()
    store.redo()
    expect(store.getState().doc.blocks['hero']?.props.x).toBe(30)
    expect(store.getState().canRedo).toBe(false)
  })

  it('drops the redo stack once a new edit lands', () => {
    const store = new Store(seed())
    store.apply({ op: 'nudge', id: 'hero', path: 'x', delta: 30 }, 'drag-1', 1)
    store.undo()
    store.apply({ op: 'nudge', id: 'hero', path: 'y', delta: 5 }, 'drag-2', 2)
    expect(store.getState().canRedo).toBe(false)
  })

  it('records no history for a command the reducer rejects', () => {
    const store = new Store(seed())
    store.apply({ op: 'nudge', id: 'ghost', path: 'x', delta: 5 }, 'drag-1', 1)
    expect(store.getState().canUndo).toBe(false)
  })
})

describe('shell state', () => {
  it('notifies subscribers on selection change', () => {
    const store = new Store(seed())
    const listener = vi.fn()
    store.subscribe(listener)
    store.apply({ op: 'select', id: 'hero' })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getState().selectedId).toBe('hero')
  })

  it('stays silent when selection does not change', () => {
    const store = new Store(seed())
    store.apply({ op: 'select', id: 'hero' })
    const listener = vi.fn()
    store.subscribe(listener)
    store.apply({ op: 'select', id: 'hero' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('clears selection when the selected block is removed', () => {
    const store = new Store(seed())
    store.apply({ op: 'select', id: 'copy' })
    store.apply({ op: 'remove', id: 'copy' })
    expect(store.getState().selectedId).toBeNull()
  })

  it('routes undo and redo commands through the bus', () => {
    const store = new Store(seed())
    store.apply({ op: 'nudge', id: 'hero', path: 'x', delta: 12 }, 'drag-1', 1)
    store.apply({ op: 'undo' })
    expect(store.getState().doc.blocks['hero']?.props.x).toBe(0)
    store.apply({ op: 'redo' })
    expect(store.getState().doc.blocks['hero']?.props.x).toBe(12)
  })

  it('stops notifying after unsubscribe', () => {
    const store = new Store(seed())
    const listener = vi.fn()
    const off = store.subscribe(listener)
    off()
    store.apply({ op: 'select', id: 'hero' })
    expect(listener).not.toHaveBeenCalled()
  })
})
