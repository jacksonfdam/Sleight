import { describe, expect, it } from 'vitest'
import { starterDocument } from '../src/core/document'
import type { ParseContext } from '../src/language/grammar'
import { buildPrompt, stripFences, validateCommand } from '../src/language/parser'

const context: ParseContext = { doc: starterDocument(), selectedId: 'hero' }

describe('fence stripping', () => {
  it('unwraps a fenced json block', () => {
    expect(stripFences('```json\n{"op":"noop"}\n```')).toBe('{"op":"noop"}')
  })

  it('unwraps an unlabelled fence', () => {
    expect(stripFences('```\n{"op":"noop"}\n```')).toBe('{"op":"noop"}')
  })

  it('leaves raw json alone', () => {
    expect(stripFences('  {"op":"noop"}  ')).toBe('{"op":"noop"}')
  })
})

describe('command validation', () => {
  it('accepts a well formed set', () => {
    expect(
      validateCommand({ op: 'set', id: 'hero', path: 'color', value: '#008080' }, context),
    ).toEqual({ op: 'set', id: 'hero', path: 'color', value: '#008080' })
  })

  it('falls back to the selection when no id is given', () => {
    expect(validateCommand({ op: 'set', path: 'fontSize', value: 40 }, context)).toEqual({
      op: 'set',
      id: 'hero',
      path: 'fontSize',
      value: 40,
    })
  })

  it('rejects a value whose type does not match its path', () => {
    expect(
      validateCommand({ op: 'set', id: 'hero', path: 'fontSize', value: 'big' }, context),
    ).toEqual({ op: 'noop' })
    expect(
      validateCommand({ op: 'set', id: 'hero', path: 'align', value: 'middle' }, context),
    ).toEqual({ op: 'noop' })
  })

  it('rejects a path outside the vocabulary', () => {
    expect(validateCommand({ op: 'set', id: 'hero', path: 'opacity', value: 1 }, context)).toEqual({
      op: 'noop',
    })
  })

  it('rejects an op outside the vocabulary', () => {
    expect(validateCommand({ op: 'explode', id: 'hero' }, context)).toEqual({ op: 'noop' })
  })

  it('rejects a nudge on a non numeric path', () => {
    expect(validateCommand({ op: 'nudge', id: 'hero', path: 'color', delta: 4 }, context)).toEqual({
      op: 'noop',
    })
  })

  it('rejects a reference to a block that does not exist', () => {
    expect(validateCommand({ op: 'remove', id: 'ghost' }, context)).toEqual({ op: 'noop' })
  })

  it('rejects anything that is not an object', () => {
    expect(validateCommand('set the color', context)).toEqual({ op: 'noop' })
    expect(validateCommand(null, context)).toEqual({ op: 'noop' })
    expect(validateCommand([{ op: 'undo' }], context)).toEqual({ op: 'noop' })
  })

  it('accepts history and selection commands', () => {
    expect(validateCommand({ op: 'undo' }, context)).toEqual({ op: 'undo' })
    expect(validateCommand({ op: 'select', id: null }, context)).toEqual({ op: 'select', id: null })
  })

  it('declines insert rather than inventing a block', () => {
    expect(validateCommand({ op: 'insert', parent: 'root', index: 0 }, context)).toEqual({
      op: 'noop',
    })
  })
})

describe('prompt context', () => {
  it('carries the selection, a minimal manifest, and the locked keys', () => {
    const payload: unknown = JSON.parse(buildPrompt('make it wider', context, ['hero:geom']))
    expect(payload).toEqual({
      utterance: 'make it wider',
      selection: 'hero',
      blocks: [
        { id: 'hero', type: 'hero', label: 'Hero' },
        { id: 'intro', type: 'text', label: 'Intro copy' },
        { id: 'shot', type: 'image', label: 'Image' },
      ],
      locked: ['hero:geom'],
    })
  })
})
