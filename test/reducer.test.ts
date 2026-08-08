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

describe('rotation', () => {
  const angle = (doc: ReturnType<typeof seed>): number | undefined =>
    doc.blocks['hero']?.props.rotation

  it('wraps past a full turn rather than stopping at it', () => {
    expect(angle(reduce(seed(), { op: 'set', id: 'hero', path: 'rotation', value: 400 }))).toBe(40)
    expect(angle(reduce(seed(), { op: 'set', id: 'hero', path: 'rotation', value: 360 }))).toBe(0)
  })

  it('wraps a negative angle into the positive range', () => {
    expect(angle(reduce(seed(), { op: 'set', id: 'hero', path: 'rotation', value: -90 }))).toBe(270)
  })

  it('keeps turning when nudged past the top', () => {
    let doc = reduce(seed(), { op: 'set', id: 'hero', path: 'rotation', value: 350 })
    doc = reduce(doc, { op: 'nudge', id: 'hero', path: 'rotation', delta: 20 })
    expect(angle(doc)).toBe(10)
  })

  it('falls back to zero for a value that is not a number', () => {
    expect(
      angle(reduce(seed(), { op: 'set', id: 'hero', path: 'rotation', value: Number.NaN })),
    ).toBe(0)
  })
})

describe('text styles', () => {
  it('switches a flag and reports no change when it is already set', () => {
    const on = reduce(seed(), { op: 'set', id: 'hero', path: 'bold', value: true })
    expect(on.blocks['hero']?.props.bold).toBe(true)
    expect(reduce(on, { op: 'set', id: 'hero', path: 'bold', value: true })).toBe(on)
  })

  it('keeps the three flags independent', () => {
    let doc = reduce(seed(), { op: 'set', id: 'hero', path: 'bold', value: true })
    doc = reduce(doc, { op: 'set', id: 'hero', path: 'underline', value: true })
    const props = doc.blocks['hero']?.props
    expect(props?.bold).toBe(true)
    expect(props?.underline).toBe(true)
    expect(props?.italic).toBe(false)
  })
})

describe('centring', () => {
  const canvas = (): ReturnType<typeof seed> => seed()

  it('centres on the axis it is asked for', () => {
    const doc = reduce(canvas(), { op: 'center', id: 'hero', axis: 'x' })
    const root = doc.blocks[ROOT_ID]?.props
    const hero = doc.blocks['hero']?.props
    expect(hero?.x).toBe(Math.round(((root?.w ?? 0) - (hero?.w ?? 0)) / 2))
    expect(hero?.y).toBe(canvas().blocks['hero']?.props.y)
  })

  it('centres on both axes', () => {
    const doc = reduce(canvas(), { op: 'center', id: 'hero', axis: 'both' })
    const root = doc.blocks[ROOT_ID]?.props
    const hero = doc.blocks['hero']?.props
    expect(hero?.x).toBe(Math.round(((root?.w ?? 0) - (hero?.w ?? 0)) / 2))
    expect(hero?.y).toBe(Math.round(((root?.h ?? 0) - (hero?.h ?? 0)) / 2))
  })

  it('refuses the root and an unknown block', () => {
    const doc = canvas()
    expect(reduce(doc, { op: 'center', id: ROOT_ID, axis: 'both' })).toBe(doc)
    expect(reduce(doc, { op: 'center', id: 'ghost', axis: 'both' })).toBe(doc)
  })
})

describe('scaling', () => {
  it('multiplies the box and keeps the centre still', () => {
    const before = seed().blocks['hero']?.props
    const doc = reduce(seed(), { op: 'scale', id: 'hero', factor: 2, of: 'box' })
    const after = doc.blocks['hero']?.props
    expect(after?.w).toBe((before?.w ?? 0) * 2)
    expect(after?.h).toBe((before?.h ?? 0) * 2)
    expect((after?.x ?? 0) + (after?.w ?? 0) / 2).toBeCloseTo(
      (before?.x ?? 0) + (before?.w ?? 0) / 2,
      0,
    )
  })

  it('multiplies the type without touching the box', () => {
    const before = seed().blocks['hero']?.props
    const doc = reduce(seed(), { op: 'scale', id: 'hero', factor: 2, of: 'font' })
    const after = doc.blocks['hero']?.props
    expect(after?.fontSize).toBe((before?.fontSize ?? 0) * 2)
    expect(after?.w).toBe(before?.w)
  })

  it('shrinks on a factor below one', () => {
    const before = seed().blocks['hero']?.props
    const doc = reduce(seed(), { op: 'scale', id: 'hero', factor: 0.5, of: 'box' })
    expect(doc.blocks['hero']?.props.w).toBe(Math.round((before?.w ?? 0) / 2))
  })

  it('refuses a factor that is not a positive number', () => {
    const doc = seed()
    expect(reduce(doc, { op: 'scale', id: 'hero', factor: 0, of: 'box' })).toBe(doc)
    expect(reduce(doc, { op: 'scale', id: 'hero', factor: -2, of: 'box' })).toBe(doc)
    expect(reduce(doc, { op: 'scale', id: 'hero', factor: Number.NaN, of: 'box' })).toBe(doc)
  })
})
