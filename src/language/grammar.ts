import { insertCommand, isAlign } from '../core/document'
import type { Align, Command, DocumentState, FlagPath, NumericPath, PropPath } from '../core/types'
import { VOICE_FONT_STEP_PX, VOICE_ROTATE_STEP_DEG, VOICE_SIZE_STEP_PX } from '../tuning'
import { blockTypeFor, resolveTarget } from './target'

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
  rotation: 'rotation',
  angle: 'rotation',
  alignment: 'align',
  align: 'align',
  text: 'text',
  copy: 'text',
  label: 'text',
  image: 'src',
  source: 'src',
  src: 'src',
  bold: 'bold',
  italic: 'italic',
  italics: 'italic',
  underline: 'underline',
}

/**
 * Verbs that switch a flag, and which way. Both directions are listed because
 * "unbold it" has to be a rule rather than a phrasing the grammar shrugs at
 * after happily accepting "bold it".
 */
const FLAG_VERBS: Record<string, { readonly path: FlagPath; readonly value: boolean }> = {
  bold: { path: 'bold', value: true },
  embolden: { path: 'bold', value: true },
  unbold: { path: 'bold', value: false },
  italicise: { path: 'italic', value: true },
  italicize: { path: 'italic', value: true },
  unitalicise: { path: 'italic', value: false },
  unitalicize: { path: 'italic', value: false },
  underline: { path: 'underline', value: true },
  ununderline: { path: 'underline', value: false },
}

/** Adjective forms, used after `make it` and after `remove the`. */
const FLAG_WORDS: Record<string, FlagPath> = {
  bold: 'bold',
  boldface: 'bold',
  italic: 'italic',
  italics: 'italic',
  italicised: 'italic',
  italicized: 'italic',
  underlined: 'underline',
  underline: 'underline',
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

/** Values that turn a flag off, for `set the bold to off` style phrasing. */
const OFF = /^(?:off|false|no|none|normal|plain)$/

function propFor(raw: string): PropPath | null {
  return PROPS[raw.trim().replace(/^(?:the|its|it's) /, '')] ?? null
}

/**
 * Words that carry no target of their own. They are dropped before the rest of
 * a phrase is looked up, so "it", "to the", and "" all mean the same thing: act
 * on whatever is selected.
 */
const FILLER = /^(?:to|into|the|a|an|my|its|it|this|that)$/

/** The longest property name is two words; three allows for a leading article. */
const PROP_WORDS = 3

/**
 * The block a property phrase acts on, or null when it names a block that is not
 * on the canvas. An empty remainder falls back to the selection, which is what
 * makes "make it wider" and "make the hero wider" the same rule rather than two.
 */
function targetFor(phrase: string, context: ParseContext): string | null {
  const rest = phrase
    .split(' ')
    .filter(word => word.length > 0 && !FILLER.test(word))
    .join(' ')
  if (rest.length === 0) return context.selectedId
  return resolveTarget(context.doc, rest, context.selectedId)?.id ?? null
}

/**
 * Splits a phrase such as `the second heading font size` into the block it names
 * and the property it names. The property is matched from the longest candidate
 * down, because `text colour` has to win over the trailing `colour` — otherwise
 * the leading `text` would be read as a block type and quietly retarget the
 * command at the first text block on the canvas.
 */
function targetedProp(
  phrase: string,
  context: ParseContext,
): { readonly id: string; readonly path: PropPath } | null {
  const words = phrase.split(' ').filter(word => word.length > 0)
  for (let take = Math.min(PROP_WORDS, words.length); take >= 1; take -= 1) {
    const path = propFor(words.slice(words.length - take).join(' '))
    if (path === null) continue
    const id = targetFor(words.slice(0, words.length - take).join(' '), context)
    if (id !== null) return { id, path }
  }
  return null
}

/** Built from the table so a new verb needs adding in exactly one place. */
const FLAG_VERB_RE = new RegExp(
  `^(?<verb>${Object.keys(FLAG_VERBS).join('|')})(?: (?<target>.+))?$`,
)

/** Words that mean the turn goes the other way. */
const ANTICLOCKWISE = /\b(?:left|anticlockwise|counterclockwise|counter|back|backwards)\b/

/** Words that only ever appear in a rotation, used to disambiguate `turn`. */
const ROTATION_WORDS = /\b(?:degrees?|deg|clockwise|anticlockwise|counterclockwise|around)\b/

/** Everything that decorates a rotation without naming the block. */
const ROTATION_NOISE =
  /\b(?:degrees?|deg|by|clockwise|anticlockwise|counterclockwise|counter|left|right|back|backwards|forwards?|around)\b/g

/**
 * A rotation, absolute when the phrase says `to` and relative otherwise.
 *
 * `explicit` is false for `turn`, which the property grammar also owns. Without
 * a number or a rotation word, `turn the hero to red` would otherwise be read as
 * a quarter turn of the hero rather than falling through to the colour rule.
 */
function rotateCommand(rest: string, explicit: boolean, context: ParseContext): Command | null {
  const digits = /(-?\d+(?:\.\d+)?)/.exec(rest)
  if (digits === null && !explicit && !ROTATION_WORDS.test(rest)) return null

  const named = rest.replace(/-?\d+(?:\.\d+)?/g, ' ').replace(ROTATION_NOISE, ' ')
  const id = targetFor(named, context)
  if (id === null) return null

  const raw = digits?.[1]
  const amount = raw === undefined ? VOICE_ROTATE_STEP_DEG : Math.round(Number.parseFloat(raw) || 0)

  // `to` marks the angle as a destination; without it the angle is a step.
  if (raw !== undefined && /\bto\b/.test(rest)) {
    return { op: 'set', id, path: 'rotation', value: amount }
  }
  const sign = ANTICLOCKWISE.test(rest) ? -1 : 1
  return { op: 'nudge', id, path: 'rotation', delta: sign * amount }
}

/** A relative size change, on the box or on the type. */
function growCommand(id: string, how: string, font: boolean): Command | null {
  const step = GROW[how]
  if (step === undefined) return null
  if (!font) return { op: 'nudge', id, path: step.path, delta: step.sign * VOICE_SIZE_STEP_PX }
  // Type has one axis, so only the words that mean "more" or "less" apply to it.
  if (how === 'taller' || how === 'shorter') return null
  return { op: 'nudge', id, path: 'fontSize', delta: step.sign * VOICE_FONT_STEP_PX }
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
    case 'y':
    case 'rotation': {
      const value = resolveNumber(raw)
      return value === null ? NOOP : { op: 'set', id, path, value }
    }
    case 'text':
      return { op: 'set', id, path: 'text', value: raw.trim() }
    case 'src':
      return { op: 'set', id, path: 'src', value: raw.trim() }
    case 'bold':
    case 'italic':
    case 'underline':
      return { op: 'set', id, path, value: !OFF.test(raw.trim()) }
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

  // Insert is checked before the selection guard: adding a block is the one
  // command that is meaningful with nothing selected.
  const add = /^(?:add|insert|create|place|put|new) (?<what>.+)$/.exec(text)
  if (add?.groups?.['what'] !== undefined) {
    const type = blockTypeFor(add.groups['what'])
    if (type !== null) return insertCommand(context.doc, type)
  }

  // Checked before deletion, because `remove the underline` is far more likely
  // to be about the underline than about a block someone labelled Underline.
  const unstyle =
    /^(?:remove|drop|clear|take off|get rid of)(?: the| its)? (?<word>[a-z]+)(?: (?:from|on|in) (?<target>.+))?$/.exec(
      text,
    )
  const unword = unstyle?.groups?.['word']
  if (unword !== undefined) {
    const path = FLAG_WORDS[unword]
    if (path !== undefined) {
      const id = targetFor(unstyle?.groups?.['target'] ?? '', context)
      if (id !== null) return { op: 'set', id, path, value: false }
    }
  }

  const flagVerb = FLAG_VERB_RE.exec(text)
  const verb = flagVerb?.groups?.['verb']
  if (verb !== undefined) {
    const entry = FLAG_VERBS[verb]
    const id = targetFor(flagVerb?.groups?.['target'] ?? '', context)
    if (entry !== undefined && id !== null) {
      return { op: 'set', id, path: entry.path, value: entry.value }
    }
  }

  // The canvas itself is not in the target vocabulary, so no phrasing of this
  // can reach the root block. Deleting is a normal transaction and undoes like
  // any other, which is what makes it safe to accept from a microphone at all.
  // An unresolvable target falls through rather than stopping here, so a phrase
  // the delete rule cannot place still reaches the rules below it.
  const remove = /^(?:delete|remove|drop|erase|get rid of)(?: (?<target>.+))?$/.exec(text)
  if (remove !== null) {
    const id = targetFor(remove.groups?.['target'] ?? '', context)
    if (id !== null) return { op: 'remove', id }
  }

  // Every rule below takes an optional target, so none of them needs a
  // selection to exist. `targetFor` supplies the selection when none is named.
  const align = /^(?:align|justify) (?<rest>.+)$/.exec(text)
  if (align?.groups?.['rest'] !== undefined) {
    const words = align.groups['rest'].split(' ')
    const value = resolveAlign(words[words.length - 1] ?? '')
    const id = targetFor(words.slice(0, -1).join(' '), context)
    if (value !== null && id !== null) return { op: 'set', id, path: 'align', value }
  }

  const centre = /^cent(?:er|re)(?: (?<target>.+))?$/.exec(text)
  if (centre !== null) {
    const id = targetFor(centre.groups?.['target'] ?? '', context)
    if (id !== null) return { op: 'set', id, path: 'align', value: 'center' }
  }

  const straighten = /^(?:straighten|unrotate)(?: (?<target>.+))?$/.exec(text)
  if (straighten !== null) {
    const id = targetFor(straighten.groups?.['target'] ?? '', context)
    if (id !== null) return { op: 'set', id, path: 'rotation', value: 0 }
  }

  const rotate = /^(?<verb>rotate|tilt|spin|turn) (?<rest>.+)$/.exec(text)
  const spin = rotate?.groups?.['rest']
  if (spin !== undefined) {
    const cmd = rotateCommand(spin, rotate?.groups?.['verb'] !== 'turn', context)
    if (cmd !== null) return cmd
  }

  const grow = /^make (?<rest>.+)$/.exec(text)
  if (grow?.groups?.['rest'] !== undefined) {
    const words = grow.groups['rest'].split(' ')
    const how = words[words.length - 1] ?? ''
    // `not` is pulled out before the target is read, so it cannot be mistaken
    // for part of a block name.
    const negated = words.includes('not')
    const head = words.slice(0, -1).filter(word => word !== 'not')
    // A trailing `text`, `type`, or `font` moves the change from box to type.
    const font = /^(?:text|type|font)$/.test(head[head.length - 1] ?? '')
    const id = targetFor((font ? head.slice(0, -1) : head).join(' '), context)
    if (id !== null) {
      const flag = FLAG_WORDS[how]
      if (flag !== undefined) return { op: 'set', id, path: flag, value: !negated }
      const cmd = growCommand(id, how, font)
      if (cmd !== null) return cmd
    }
  }

  const set =
    /^(?:change|set|make|turn) (?<prop>[a-z' ]+?) (?:to|into) (?<value>.+)$/.exec(text) ??
    /^(?<prop>[a-z' ]+?) (?:to|=) (?<value>.+)$/.exec(text)
  const prop = set?.groups?.['prop']
  const value = set?.groups?.['value']
  if (prop !== undefined && value !== undefined) {
    const targeted = targetedProp(prop, context)
    if (targeted !== null) return setCommand(targeted.id, targeted.path, value)
  }

  return NOOP
}
