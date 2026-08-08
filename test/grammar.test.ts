import { describe, expect, it } from 'vitest'
import { starterDocument } from '../src/core/document'
import { parseGrammar } from '../src/language/grammar'
import type { ParseContext } from '../src/language/grammar'
import { VOICE_FONT_STEP_PX, VOICE_SIZE_STEP_PX } from '../src/tuning'

const context: ParseContext = { doc: starterDocument(), selectedId: 'hero' }
const unselected: ParseContext = { doc: starterDocument(), selectedId: null }

describe('property changes', () => {
  it('resolves a spoken colour to hex', () => {
    expect(parseGrammar('change the text color to teal', context)).toEqual({
      op: 'set',
      id: 'hero',
      path: 'color',
      value: '#0f766e',
    })
  })

  it('accepts british spelling', () => {
    expect(parseGrammar('change the colour to navy', context)).toEqual({
      op: 'set',
      id: 'hero',
      path: 'color',
      value: '#1e3a5f',
    })
  })

  it('accepts a hex literal', () => {
    expect(parseGrammar('set the color to #ff8800', context)).toEqual({
      op: 'set',
      id: 'hero',
      path: 'color',
      value: '#ff8800',
    })
  })

  it('expands short hex', () => {
    expect(parseGrammar('set the color to #f80', context)).toEqual({
      op: 'set',
      id: 'hero',
      path: 'color',
      value: '#ff8800',
    })
  })

  it('parses a font size with units', () => {
    expect(parseGrammar('change the font size to 32 pixels', context)).toEqual({
      op: 'set',
      id: 'hero',
      path: 'fontSize',
      value: 32,
    })
  })

  it('parses width and height', () => {
    expect(parseGrammar('set the width to 500', context)).toEqual({
      op: 'set',
      id: 'hero',
      path: 'w',
      value: 500,
    })
    expect(parseGrammar('set the height to 240', context)).toEqual({
      op: 'set',
      id: 'hero',
      path: 'h',
      value: 240,
    })
  })

  it('rejects an unknown colour name', () => {
    expect(parseGrammar('change the color to burnt sienna', context)).toEqual({ op: 'noop' })
  })
})

describe('relative size', () => {
  it('grows and shrinks width', () => {
    expect(parseGrammar('make it wider', context)).toEqual({
      op: 'nudge',
      id: 'hero',
      path: 'w',
      delta: VOICE_SIZE_STEP_PX,
    })
    expect(parseGrammar('make it narrower', context)).toEqual({
      op: 'nudge',
      id: 'hero',
      path: 'w',
      delta: -VOICE_SIZE_STEP_PX,
    })
  })

  it('grows and shrinks height', () => {
    expect(parseGrammar('make it taller', context)).toEqual({
      op: 'nudge',
      id: 'hero',
      path: 'h',
      delta: VOICE_SIZE_STEP_PX,
    })
    expect(parseGrammar('make it shorter', context)).toEqual({
      op: 'nudge',
      id: 'hero',
      path: 'h',
      delta: -VOICE_SIZE_STEP_PX,
    })
  })

  it('changes type scale separately from box size', () => {
    expect(parseGrammar('make the text bigger', context)).toEqual({
      op: 'nudge',
      id: 'hero',
      path: 'fontSize',
      delta: VOICE_FONT_STEP_PX,
    })
  })
})

describe('alignment', () => {
  it('parses each alignment', () => {
    for (const value of ['left', 'center', 'right'] as const) {
      expect(parseGrammar(`align ${value}`, context)).toEqual({
        op: 'set',
        id: 'hero',
        path: 'align',
        value,
      })
    }
  })

  it('accepts british spelling of centre', () => {
    expect(parseGrammar('align centre', context)).toEqual({
      op: 'set',
      id: 'hero',
      path: 'align',
      value: 'center',
    })
  })
})

describe('history and selection', () => {
  it('parses undo and redo', () => {
    expect(parseGrammar('undo', context)).toEqual({ op: 'undo' })
    expect(parseGrammar('redo', context)).toEqual({ op: 'redo' })
  })

  it('selects by block type', () => {
    expect(parseGrammar('select the image', context)).toEqual({ op: 'select', id: 'shot' })
  })

  it('selects with no prior selection', () => {
    expect(parseGrammar('select the hero', unselected)).toEqual({ op: 'select', id: 'hero' })
  })

  it('ignores a block type that is not on the canvas', () => {
    expect(parseGrammar('select the section', context)).toEqual({ op: 'noop' })
  })

  it('selects by label when the phrase names no type', () => {
    expect(parseGrammar('select intro copy', context)).toEqual({ op: 'select', id: 'intro' })
  })

  it('selects by position in the canvas order', () => {
    expect(parseGrammar('select the last block', context)).toEqual({ op: 'select', id: 'shot' })
    expect(parseGrammar('select the first block', context)).toEqual({ op: 'select', id: 'hero' })
  })

  it('walks the canvas relative to the selection', () => {
    expect(parseGrammar('select the next block', context)).toEqual({ op: 'select', id: 'intro' })
    expect(parseGrammar('select the previous block', context)).toEqual({ op: 'select', id: 'shot' })
  })
})

describe('rejection', () => {
  it('ignores anything outside the vocabulary', () => {
    expect(parseGrammar('what is the weather like', context)).toEqual({ op: 'noop' })
    expect(parseGrammar('', context)).toEqual({ op: 'noop' })
  })

  it('ignores property changes with nothing selected', () => {
    expect(parseGrammar('change the color to teal', unselected)).toEqual({ op: 'noop' })
  })

  it('strips filler openings and punctuation', () => {
    expect(parseGrammar('Okay, align right.', context)).toEqual({
      op: 'set',
      id: 'hero',
      path: 'align',
      value: 'right',
    })
  })
})
