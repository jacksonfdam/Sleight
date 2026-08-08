import { isAlign } from '../core/document'
import type { Align, Command, NumericPath, PropPath } from '../core/types'
import type { ParseContext } from './grammar'
import { parseGrammar } from './grammar'
import { PromptSession } from './prompt'
import { isSpeechSupported } from './speech'

export type CapabilityTier = 'full' | 'grammar' | 'manual'

const NOOP: Command = { op: 'noop' }

const PATHS: readonly PropPath[] = ['x', 'y', 'w', 'h', 'color', 'fontSize', 'align', 'src', 'text']
const NUMERIC: readonly NumericPath[] = ['x', 'y', 'w', 'h', 'fontSize']

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

function targetId(record: Record<string, unknown>, context: ParseContext): string | null {
  const id = record['id']
  if (typeof id === 'string' && context.doc.blocks[id] !== undefined) return id
  return context.selectedId
}

function setFrom(id: string, path: PropPath, value: unknown): Command {
  if (path === 'align') {
    return isAlign(value) ? { op: 'set', id, path: 'align', value: value satisfies Align } : NOOP
  }
  if (path === 'color' || path === 'src' || path === 'text') {
    return typeof value === 'string' ? { op: 'set', id, path, value } : NOOP
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
      return typeof id === 'string' && context.doc.blocks[id] !== undefined
        ? { op: 'select', id }
        : NOOP
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
      return typeof id === 'string' && context.doc.blocks[id] !== undefined
        ? { op: 'remove', id }
        : NOOP
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

    // `insert` needs a whole block, which cannot be reconstructed safely from a
    // partial response, so it is declined rather than guessed at.
    default:
      return NOOP
  }
}

export interface ParserDeps {
  readonly getContext: () => ParseContext
  readonly getLockedKeys: () => readonly string[]
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
    if (this.session === null) return parseGrammar(utterance, context)

    const raw = await this.session.run(buildPrompt(utterance, context, this.deps.getLockedKeys()))
    if (raw === null) return parseGrammar(utterance, context)

    const parsed = this.narrow(raw, context)
    return parsed.op === 'noop' ? parseGrammar(utterance, context) : parsed
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
