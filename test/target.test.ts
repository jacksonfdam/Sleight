import { describe, expect, it } from 'vitest'
import { insertCommand, nextBlockId, starterDocument } from '../src/core/document'
import { reduce } from '../src/core/reducer'
import type { DocumentState } from '../src/core/types'
import { blockTypeFor, resolveTarget } from '../src/language/target'

/** The starter canvas plus three headings, to give the ordinals something to count. */
function withHeadings(): DocumentState {
  let doc = starterDocument()
  for (const type of ['h1', 'h2', 'h2'] as const) doc = reduce(doc, insertCommand(doc, type))
  return doc
}

const doc = withHeadings()
const idOf = (phrase: string, selected: string | null = null): string | null =>
  resolveTarget(doc, phrase, selected)?.id ?? null

describe('resolving a spoken target', () => {
  it('resolves a pronoun to the current selection', () => {
    expect(idOf('it', 'intro')).toBe('intro')
    expect(idOf('this', 'shot')).toBe('shot')
    expect(idOf('it', null)).toBeNull()
  })

  it('resolves a type name to the first block of that type', () => {
    expect(idOf('the image')).toBe('shot')
    expect(idOf('the hero')).toBe('hero')
  })

  it('accepts a plural without matching a longer word that ends in s', () => {
    expect(idOf('the images')).toBe('shot')
    expect(idOf('the previous block', 'intro')).toBe('hero')
  })

  it('treats heading as any heading level', () => {
    expect(idOf('the heading')).toBe('h1-1')
    expect(idOf('the second heading')).toBe('h2-1')
    expect(idOf('the last heading')).toBe('h2-2')
  })

  it('narrows a specific level', () => {
    expect(idOf('the h2')).toBe('h2-1')
    expect(idOf('the second h2')).toBe('h2-2')
  })

  it('counts position in canvas order', () => {
    expect(idOf('the first block')).toBe('hero')
    expect(idOf('the last block')).toBe('h2-2')
  })

  it('walks forward and back from the selection, wrapping at the ends', () => {
    expect(idOf('next', 'hero')).toBe('intro')
    expect(idOf('previous', 'hero')).toBe('h2-2')
    expect(idOf('next', 'h2-2')).toBe('hero')
  })

  it('falls back to the block label', () => {
    expect(idOf('intro copy')).toBe('intro')
    expect(idOf('intro')).toBe('intro')
  })

  it('returns nothing for a phrase that names nothing on the canvas', () => {
    expect(idOf('the sidebar')).toBeNull()
    expect(idOf('')).toBeNull()
  })
})

describe('resolving a spoken block type', () => {
  it('maps synonyms onto a single type', () => {
    expect(blockTypeFor('a paragraph')).toBe('paragraph')
    expect(blockTypeFor('some copy')).toBeNull()
    expect(blockTypeFor('copy')).toBe('paragraph')
    expect(blockTypeFor('a picture')).toBe('image')
  })

  it('creates the top level for a bare heading', () => {
    expect(blockTypeFor('a heading')).toBe('h1')
    expect(blockTypeFor('an h3')).toBe('h3')
    expect(blockTypeFor('a heading three')).toBe('h3')
  })

  it('ignores a trailing noun', () => {
    expect(blockTypeFor('a paragraph block')).toBe('paragraph')
    expect(blockTypeFor('an h2 element')).toBe('h2')
  })

  it('returns nothing for a word outside the vocabulary', () => {
    expect(blockTypeFor('a carousel')).toBeNull()
  })
})

describe('building an insert', () => {
  it('never reuses an id', () => {
    expect(nextBlockId(doc, 'h2')).toBe('h2-3')
    expect(nextBlockId(starterDocument(), 'h1')).toBe('h1-1')
  })

  it('stacks the new block under the lowest one', () => {
    const base = starterDocument()
    const cmd = insertCommand(base, 'h1')
    const lowest = Math.max(
      ...Object.values(base.blocks)
        .filter(block => block.id !== base.rootId)
        .map(block => block.props.y + block.props.h),
    )
    expect(cmd.block.props.y).toBeGreaterThan(lowest)
  })

  it('keeps every block inside the canvas however full it gets', () => {
    let base = starterDocument()
    for (let i = 0; i < 12; i += 1) base = reduce(base, insertCommand(base, 'h4'))
    const root = base.blocks[base.rootId]
    for (const block of Object.values(base.blocks)) {
      if (block.id === base.rootId) continue
      expect(block.props.y + block.props.h).toBeLessThanOrEqual(root?.props.h ?? 0)
      expect(block.props.x + block.props.w).toBeLessThanOrEqual(root?.props.w ?? 0)
    }
  })

  it('moves to the next column once one is full', () => {
    let base = starterDocument()
    // A narrow type, so a second column still fits beside the first.
    const first = insertCommand(base, 'h4')
    base = reduce(base, first)
    let folded = first
    for (let i = 0; i < 4 && folded.block.props.x === first.block.props.x; i += 1) {
      folded = insertCommand(base, 'h4')
      base = reduce(base, folded)
    }
    expect(folded.block.props.x).toBeGreaterThan(first.block.props.x)
  })

  // A finite canvas has to reuse a position eventually. What must never happen
  // is one insert landing exactly on the insert before it, which is the case
  // that looks like nothing happened at all.
  it('never puts a block exactly on top of the one before it', () => {
    let base = starterDocument()
    let last = ''
    for (let i = 0; i < 10; i += 1) {
      const cmd = insertCommand(base, 'h4')
      base = reduce(base, cmd)
      const at = `${String(cmd.block.props.x)}:${String(cmd.block.props.y)}`
      expect(at).not.toBe(last)
      last = at
    }
  })

  it('appends to the canvas rather than replacing a block', () => {
    const cmd = insertCommand(doc, 'paragraph')
    expect(cmd.parent).toBe(doc.rootId)
    expect(reduce(doc, cmd).children[doc.rootId]).toHaveLength(7)
  })
})
