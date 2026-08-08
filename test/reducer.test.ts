import { describe, expect, it } from 'vitest'
import { ROOT_ID, createBlock, emptyDocument, getChildren, getParent } from '../src/core/document'
import { reduce } from '../src/core/reducer'
import type { DocumentState } from '../src/core/types'

function seed(): DocumentState {
  let doc = emptyDocument()
  doc = reduce(doc, {
    op: 'insert',
    parent: ROOT_ID,
    index: 0,
    block: createBlock('hero', 'hero', 'Hero'),
  })
  doc = reduce(doc, {
    op: 'insert',
    parent: ROOT_ID,
    index: 1,
    block: createBlock('body', 'section', 'Body'),
  })
  doc = reduce(doc, {
    op: 'insert',
    parent: 'body',
    index: 0,
    block: createBlock('copy', 'text', 'Copy'),
  })
  return doc
}

describe('noop', () => {
  it('returns the identical reference', () => {
    const doc = seed()
    expect(reduce(doc, { op: 'noop' })).toBe(doc)
  })
})

describe('set', () => {
  it('writes a style property', () => {
    const doc = seed()
    const next = reduce(doc, { op: 'set', id: 'hero', path: 'color', value: '#008080' })
    expect(next.blocks['hero']?.props.color).toBe('#008080')
  })

  it('returns the identical reference when the value is unchanged', () => {
    const doc = seed()
    const color = doc.blocks['hero']?.props.color ?? ''
    expect(reduce(doc, { op: 'set', id: 'hero', path: 'color', value: color })).toBe(doc)
  })

  it('leaves untouched blocks referentially equal', () => {
    const doc = seed()
    const next = reduce(doc, { op: 'set', id: 'hero', path: 'color', value: '#008080' })
    expect(next.blocks['copy']).toBe(doc.blocks['copy'])
  })

  it('is a no-op for a missing block', () => {
    const doc = seed()
    expect(reduce(doc, { op: 'set', id: 'ghost', path: 'color', value: '#008080' })).toBe(doc)
  })

  it('clamps a numeric property to its lower bound', () => {
    const doc = seed()
    const next = reduce(doc, { op: 'set', id: 'hero', path: 'w', value: -500 })
    expect(next.blocks['hero']?.props.w).toBe(16)
  })
})

describe('nudge', () => {
  it('shifts a numeric property by the delta', () => {
    const doc = seed()
    const before = doc.blocks['hero']?.props.x ?? 0
    const next = reduce(doc, { op: 'nudge', id: 'hero', path: 'x', delta: 25 })
    expect(next.blocks['hero']?.props.x).toBe(before + 25)
  })

  it('is a no-op on a missing block rather than a throw', () => {
    const doc = seed()
    expect(() => reduce(doc, { op: 'nudge', id: 'ghost', path: 'x', delta: 5 })).not.toThrow()
    expect(reduce(doc, { op: 'nudge', id: 'ghost', path: 'x', delta: 5 })).toBe(doc)
  })

  it('is a no-op when the clamped result does not move', () => {
    const doc = reduce(seed(), { op: 'set', id: 'hero', path: 'w', value: 16 })
    expect(reduce(doc, { op: 'nudge', id: 'hero', path: 'w', delta: -50 })).toBe(doc)
  })
})

describe('insert', () => {
  it('places the block at the requested index', () => {
    const doc = reduce(seed(), {
      op: 'insert',
      parent: ROOT_ID,
      index: 1,
      block: createBlock('logo', 'image', 'Logo'),
    })
    expect(getChildren(doc, ROOT_ID)).toEqual(['hero', 'logo', 'body'])
    expect(getParent(doc, 'logo')).toBe(ROOT_ID)
  })

  it('rejects a duplicate id', () => {
    const doc = seed()
    const cmd = {
      op: 'insert',
      parent: ROOT_ID,
      index: 0,
      block: createBlock('hero', 'hero', 'Hero'),
    } as const
    expect(reduce(doc, cmd)).toBe(doc)
  })

  it('rejects a missing parent', () => {
    const doc = seed()
    const cmd = {
      op: 'insert',
      parent: 'ghost',
      index: 0,
      block: createBlock('logo', 'image', 'Logo'),
    } as const
    expect(reduce(doc, cmd)).toBe(doc)
  })
})

describe('move', () => {
  it('reparents a block', () => {
    const doc = reduce(seed(), { op: 'move', id: 'hero', parent: 'body', index: 0 })
    expect(getChildren(doc, ROOT_ID)).toEqual(['body'])
    expect(getChildren(doc, 'body')).toEqual(['hero', 'copy'])
    expect(getParent(doc, 'hero')).toBe('body')
  })

  it('reorders within the same parent', () => {
    const doc = reduce(seed(), { op: 'move', id: 'hero', parent: ROOT_ID, index: 2 })
    expect(getChildren(doc, ROOT_ID)).toEqual(['body', 'hero'])
  })

  it('rejects making a block its own ancestor', () => {
    const doc = seed()
    expect(reduce(doc, { op: 'move', id: 'body', parent: 'copy', index: 0 })).toBe(doc)
  })

  it('rejects moving a block into itself', () => {
    const doc = seed()
    expect(reduce(doc, { op: 'move', id: 'body', parent: 'body', index: 0 })).toBe(doc)
  })

  it('rejects moving the root', () => {
    const doc = seed()
    expect(reduce(doc, { op: 'move', id: ROOT_ID, parent: 'body', index: 0 })).toBe(doc)
  })

  it('is a no-op when the position does not change', () => {
    const doc = seed()
    expect(reduce(doc, { op: 'move', id: 'hero', parent: ROOT_ID, index: 0 })).toBe(doc)
  })
})

describe('remove', () => {
  it('deletes the block and its subtree', () => {
    const doc = reduce(seed(), { op: 'remove', id: 'body' })
    expect(doc.blocks['body']).toBeUndefined()
    expect(doc.blocks['copy']).toBeUndefined()
    expect(getChildren(doc, ROOT_ID)).toEqual(['hero'])
    expect(getParent(doc, 'copy')).toBeUndefined()
  })

  it('refuses to remove the root', () => {
    const doc = seed()
    expect(reduce(doc, { op: 'remove', id: ROOT_ID })).toBe(doc)
  })

  it('is a no-op for a missing block', () => {
    const doc = seed()
    expect(reduce(doc, { op: 'remove', id: 'ghost' })).toBe(doc)
  })
})
