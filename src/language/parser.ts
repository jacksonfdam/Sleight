import { insertCommand, isAlign, isBlockType, listBlocks } from '../core/document'
import type { GifLibrary, GifOutcome } from '../media/gifs'
import type { GifRequest } from './gif-phrases'
import { parseGifRequest } from './gif-phrases'
import type { Align, Command, NumericPath, PropPath } from '../core/types'
import type { ParseContext } from './grammar'
import { parseGrammar } from './grammar'
import { resolveTarget } from './target'
import { PromptSession } from './prompt'
import { isSpeechSupported } from './speech'

/**
 * `loading` is not a capability the browser has; it is the interval before the
 * others can be told apart. Opening a model session can take seconds on a cold
 * profile, and a badge that guesses during that window would announce the wrong
 * tier and then quietly correct itself.
 */
export type CapabilityTier = 'loading' | 'full' | 'grammar' | 'manual'

const NOOP: Command = { op: 'noop' }

const PATHS: readonly PropPath[] = [
  'x',
  'y',
  'w',
  'h',
  'rotation',
  'color',
  'fontSize',
  'align',
  'src',
  'text',
]
const NUMERIC: readonly NumericPath[] = ['x', 'y', 'w', 'h', 'fontSize', 'rotation']

function isPropPath(value: unknown): value is PropPath {
  return typeof value === 'string' && (PATHS as readonly string[]).includes(value)
}

function isNumericPath(value: unknown): value is NumericPath {
  return typeof value === 'string' && (NUMERIC as readonly string[]).includes(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Strips markdown fences a model may wrap around otherwise valid JSON. */
export function stripFences(raw: string): string {
  const trimmed = raw.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed)
  return (fenced?.[1] ?? trimmed).trim()
}

/**
 * The model is given the id list and asked to pick from it, but it will
 * sometimes answer with the block's label instead. That is a naming slip rather
 * than a wrong command, so the label is resolved before falling back to the
 * current selection.
 */
function targetId(record: Record<string, unknown>, context: ParseContext): string | null {
  const id = record['id']
  if (typeof id === 'string') {
    if (context.doc.blocks[id] !== undefined) return id
    const block = resolveTarget(context.doc, id, context.selectedId)
    if (block !== null) return block.id
  }
  return context.selectedId
}

function setFrom(id: string, path: PropPath, value: unknown): Command {
  if (path === 'align') {
    return isAlign(value) ? { op: 'set', id, path: 'align', value: value satisfies Align } : NOOP
  }
  if (path === 'color' || path === 'src' || path === 'text') {
    return typeof value === 'string' ? { op: 'set', id, path, value } : NOOP
  }
  if (path === 'bold' || path === 'italic' || path === 'underline') {
    return typeof value === 'boolean' ? { op: 'set', id, path, value } : NOOP
  }
  return typeof value === 'number' && Number.isFinite(value) ? { op: 'set', id, path, value } : NOOP
}

/**
 * A model response is untrusted input. It is narrowed to the `Command` union
 * before it can reach the bus, and anything that fails narrowing becomes a
 * no-op rather than an exception.
 */
export function validateCommand(value: unknown, context: ParseContext): Command {
  const record = asRecord(value)
  if (record === null) return NOOP

  switch (record['op']) {
    case 'noop':
      return NOOP

    case 'select': {
      const id = record['id']
      if (id === null) return { op: 'select', id: null }
      if (typeof id !== 'string') return NOOP
      if (context.doc.blocks[id] !== undefined) return { op: 'select', id }
      const block = resolveTarget(context.doc, id, context.selectedId)
      return block === null ? NOOP : { op: 'select', id: block.id }
    }

    case 'undo':
      return { op: 'undo' }

    case 'redo':
      return { op: 'redo' }

    case 'set': {
      const id = targetId(record, context)
      const path = record['path']
      if (id === null || !isPropPath(path)) return NOOP
      return setFrom(id, path, record['value'])
    }

    case 'nudge': {
      const id = targetId(record, context)
      const path = record['path']
      const delta = record['delta']
      if (id === null || !isNumericPath(path)) return NOOP
      return typeof delta === 'number' && Number.isFinite(delta)
        ? { op: 'nudge', id, path, delta }
        : NOOP
    }

    case 'remove': {
      const id = record['id']
      if (typeof id !== 'string') return NOOP
      if (context.doc.blocks[id] !== undefined) return { op: 'remove', id }
      const block = resolveTarget(context.doc, id, context.selectedId)
      return block === null ? NOOP : { op: 'remove', id: block.id }
    }

    case 'move': {
      const id = record['id']
      const parent = record['parent']
      const index = record['index']
      if (typeof id !== 'string' || typeof parent !== 'string') return NOOP
      if (context.doc.blocks[id] === undefined || context.doc.blocks[parent] === undefined) {
        return NOOP
      }
      return { op: 'move', id, parent, index: typeof index === 'number' ? index : 0 }
    }

    // The model names a type and nothing else. Geometry, label, and id are built
    // here from the same code the toolbar uses, so a partial response can never
    // put a half-formed block into the document.
    case 'insert': {
      const type = record['type']
      return isBlockType(type) ? insertCommand(context.doc, type) : NOOP
    }

    default:
      return NOOP
  }
}

export interface ParserDeps {
  readonly getContext: () => ParseContext
  readonly getLockedKeys: () => readonly string[]
  readonly gifs?: GifLibrary
  /** Short sentences for states that produce no command, such as a failed search. */
  readonly onNotice?: (message: string) => void
}

/** Plain sentences rather than a silent no-op the speaker cannot account for. */
const GIF_NOTICE: Record<GifOutcome, string> = {
  ok: '',
  unconfigured: 'GIF search needs a Giphy key in VITE_GIPHY_KEY. Nothing else is affected.',
  empty: 'No GIF matched that.',
  offline: 'The GIF service could not be reached.',
}

/** The block a GIF lands in: the selection when it is an image, else the first. */
function imageTarget(context: ParseContext): string | null {
  const selected = context.selectedId === null ? undefined : context.doc.blocks[context.selectedId]
  if (selected?.type === 'image') return selected.id
  return listBlocks(context.doc).find(block => block.type === 'image')?.id ?? null
}

/** The JSON context the model classifies against. */
export function buildPrompt(
  utterance: string,
  context: ParseContext,
  locked: readonly string[],
): string {
  const blocks = Object.values(context.doc.blocks)
    .filter(block => block.id !== context.doc.rootId)
    .map(block => ({ id: block.id, type: block.type, label: block.label }))

  return JSON.stringify({ utterance, selection: context.selectedId, blocks, locked })
}

export class CommandParser {
  private readonly deps: ParserDeps
  private readonly session: PromptSession | null

  private constructor(deps: ParserDeps, session: PromptSession | null) {
    this.deps = deps
    this.session = session
  }

  static async create(deps: ParserDeps): Promise<CommandParser> {
    return new CommandParser(deps, await PromptSession.open())
  }

  get tier(): CapabilityTier {
    if (!isSpeechSupported()) return 'manual'
    return this.session === null ? 'grammar' : 'full'
  }

  /**
   * The grammar is not a degraded path, it is the floor. The model runs first
   * when it exists, and every way it can fail — absent, timed out, malformed
   * JSON, a command outside the vocabulary — lands on the same deterministic
   * parse rather than on an error.
   */
  async parse(utterance: string): Promise<Command> {
    const context = this.deps.getContext()

    const gif = await this.parseGif(utterance)
    if (gif !== null) return gif

    if (this.session === null) return parseGrammar(utterance, context)

    const raw = await this.session.run(buildPrompt(utterance, context, this.deps.getLockedKeys()))
    if (raw === null) return parseGrammar(utterance, context)

    const parsed = this.narrow(raw, context)
    return parsed.op === 'noop' ? parseGrammar(utterance, context) : parsed
  }

  /**
   * The GIF path runs ahead of both the model and the grammar. It is the only
   * command that reaches outside the machine, so it is kept on its own branch:
   * a phrase it does not recognise returns null and the rest of the pipeline
   * proceeds as though this feature did not exist.
   */
  private async parseGif(utterance: string): Promise<Command | null> {
    const library = this.deps.gifs
    if (library === undefined) return null
    const request = parseGifRequest(utterance)
    if (request === null) return null

    // Nothing to change or shuffle before a search has run, so those phrases go
    // back to being ordinary words rather than reporting a GIF failure.
    if (request.kind !== 'search' && request.kind !== 'keep' && !library.browsing) return null

    return this.fulfilGif(request)
  }

  /**
   * Runs a GIF request and returns the command it produces. Public because the
   * inspector offers the same four actions as buttons: a spoken request and a
   * clicked one have to reach the same code, or they will drift apart.
   */
  async fulfilGif(request: GifRequest): Promise<Command> {
    const library = this.deps.gifs
    if (library === undefined) return NOOP
    const context = this.deps.getContext()

    if (request.kind === 'keep') {
      library.keep()
      this.deps.onNotice?.('')
      return NOOP
    }

    const id = imageTarget(context)
    if (id === null) {
      this.deps.onNotice?.('Add an image block first, then ask for a GIF.')
      return NOOP
    }

    const response =
      request.kind === 'search'
        ? await library.search(request.query)
        : request.kind === 'shuffle'
          ? library.shuffle()
          : library.next()

    this.deps.onNotice?.(GIF_NOTICE[response.outcome])
    if (response.gif === null) return NOOP
    return { op: 'set', id, path: 'src', value: response.gif.url }
  }

  private narrow(raw: string, context: ParseContext): Command {
    try {
      return validateCommand(JSON.parse(stripFences(raw)), context)
    } catch {
      return NOOP
    }
  }

  close(): void {
    this.session?.close()
  }
}
