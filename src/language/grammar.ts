import { isAlign } from '../core/document'
import type { Align, Command, DocumentState, NumericPath, PropPath } from '../core/types'
import { VOICE_FONT_STEP_PX, VOICE_SIZE_STEP_PX } from '../tuning'
import { resolveTarget } from './target'

export interface ParseContext {
  readonly doc: DocumentState
  readonly selectedId: string | null
}

const NOOP: Command = { op: 'noop' }

/** Spoken colour names resolved to hex, so the document never stores a keyword. */
const COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  grey: '#6b7280',
  gray: '#6b7280',
  silver: '#c0c6cf',
  slate: '#475569',
  navy: '#1e3a5f',
  blue: '#2563eb',
  sky: '#0ea5e9',
  cyan: '#06b6d4',
  teal: '#0f766e',
  emerald: '#059669',
  green: '#16a34a',
  lime: '#65a30d',
  olive: '#5f6b2a',
  yellow: '#eab308',
  amber: '#d97706',
  gold: '#b78900',
  orange: '#ea580c',
  coral: '#f2705d',
  red: '#dc2626',
  maroon: '#7f1d1d',
  crimson: '#b91c3c',
  pink: '#ec4899',
  rose: '#e11d48',
  magenta: '#c026d3',
  purple: '#9333ea',
  violet: '#7c3aed',
  indigo: '#4f46e5',
  brown: '#7c4a2d',
}

/** Spoken property names resolved to a path the compiler recognises. */
const PROPS: Record<string, PropPath> = {
  color: 'color',
  colour: 'color',
  'text color': 'color',
  'text colour': 'color',
  'font color': 'color',
  'font colour': 'color',
  'font size': 'fontSize',
  'text size': 'fontSize',
  'type size': 'fontSize',
  width: 'w',
  height: 'h',
  alignment: 'align',
  align: 'align',
  text: 'text',
  copy: 'text',
  label: 'text',
  image: 'src',
  source: 'src',
  src: 'src',
}

const GROW: Record<string, { path: NumericPath; sign: 1 | -1 }> = {
  bigger: { path: 'w', sign: 1 },
  larger: { path: 'w', sign: 1 },
  wider: { path: 'w', sign: 1 },
  smaller: { path: 'w', sign: -1 },
  narrower: { path: 'w', sign: -1 },
  taller: { path: 'h', sign: 1 },
  shorter: { path: 'h', sign: -1 },
}

function normalise(utterance: string): string {
  return utterance
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:please|okay|ok|hey|now|and) /, '')
    .trim()
}

export function resolveColor(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, '')
  if (/^#[0-9a-f]{6}$/.test(value)) return value
  if (/^#[0-9a-f]{3}$/.test(value)) {
    const [, r, g, b] = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value) ?? []
    if (r !== undefined && g !== undefined && b !== undefined) return `#${r}${r}${g}${g}${b}${b}`
  }
  return COLORS[raw.trim().replace(/^(?:the|a) /, '')] ?? null
}

function resolveNumber(raw: string): number | null {
  const match = /(-?\d+(?:\.\d+)?)/.exec(raw)
  if (match?.[1] === undefined) return null
  const value = Number.parseFloat(match[1])
  return Number.isFinite(value) ? Math.round(value) : null
}

function resolveAlign(raw: string): Align | null {
  const value = raw.trim().replace('centre', 'center')
  return isAlign(value) ? value : null
}

function propFor(raw: string): PropPath | null {
  return PROPS[raw.trim().replace(/^(?:the|its|it's) /, '')] ?? null
}

function setCommand(id: string, path: PropPath, raw: string): Command {
  switch (path) {
    case 'color': {
      const value = resolveColor(raw)
      return value === null ? NOOP : { op: 'set', id, path: 'color', value }
    }
    case 'align': {
      const value = resolveAlign(raw)
      return value === null ? NOOP : { op: 'set', id, path: 'align', value }
    }
    case 'fontSize':
    case 'w':
    case 'h':
    case 'x':
    case 'y': {
      const value = resolveNumber(raw)
      return value === null ? NOOP : { op: 'set', id, path, value }
    }
    case 'text':
      return { op: 'set', id, path: 'text', value: raw.trim() }
    case 'src':
      return { op: 'set', id, path: 'src', value: raw.trim() }
  }
}

/**
 * A closed regular grammar over the command vocabulary. It is both the fallback
 * for browsers without the built-in model and the offline path, so it has to
 * stand on its own rather than only cover what the model misses.
 */
export function parseGrammar(utterance: string, context: ParseContext): Command {
  const text = normalise(utterance)
  if (text.length === 0) return NOOP

  if (/^(?:undo|undo that|take that back)$/.test(text)) return { op: 'undo' }
  if (/^(?:redo|redo that|put it back)$/.test(text)) return { op: 'redo' }
  if (/^(?:deselect|clear selection|nothing)$/.test(text)) return { op: 'select', id: null }

  const select = /^(?:select|pick|choose|highlight|focus on|go to) (?<target>.+)$/.exec(text)
  if (select?.groups?.['target'] !== undefined) {
    const block = resolveTarget(context.doc, select.groups['target'], context.selectedId)
    return block === null ? NOOP : { op: 'select', id: block.id }
  }

  const id = context.selectedId
  if (id === null) return NOOP

  const align = /^(?:align|justify)(?: it| this)?(?: to)?(?: the)? (?<value>\w+)$/.exec(text)
  if (align?.groups?.['value'] !== undefined) {
    const value = resolveAlign(align.groups['value'])
    return value === null ? NOOP : { op: 'set', id, path: 'align', value }
  }
  if (/^cent(?:er|re) it$/.test(text)) return { op: 'set', id, path: 'align', value: 'center' }

  const textGrow = /^make (?:the )?(?:text|type|font) (?<how>bigger|larger|smaller)$/.exec(text)
  if (textGrow?.groups?.['how'] !== undefined) {
    const sign = textGrow.groups['how'] === 'smaller' ? -1 : 1
    return { op: 'nudge', id, path: 'fontSize', delta: sign * VOICE_FONT_STEP_PX }
  }

  const grow = /^make (?:it|this|that)? ?(?<how>\w+)$/.exec(text)
  if (grow?.groups?.['how'] !== undefined) {
    const step = GROW[grow.groups['how']]
    if (step !== undefined) {
      return { op: 'nudge', id, path: step.path, delta: step.sign * VOICE_SIZE_STEP_PX }
    }
  }

  const set =
    /^(?:change|set|make|turn) (?<prop>[a-z' ]+?) (?:to|into) (?<value>.+)$/.exec(text) ??
    /^(?<prop>[a-z' ]+?) (?:to|=) (?<value>.+)$/.exec(text)
  const prop = set?.groups?.['prop']
  const value = set?.groups?.['value']
  if (prop !== undefined && value !== undefined) {
    const path = propFor(prop)
    if (path !== null) return setCommand(id, path, value)
  }

  return NOOP
}
