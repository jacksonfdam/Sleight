import { isBlockType, isAlign } from './document'
import type { Block, BlockProps, DocumentState } from './types'

const STORAGE_KEY = 'sleight.document.v1'

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

/** Anything that is not a stored `true` reads as off, including a missing key. */
function flag(value: unknown): boolean {
  return value === true
}

function readProps(value: unknown): BlockProps {
  const record = asRecord(value) ?? {}
  const align = record['align']
  return {
    x: number(record['x'], 0),
    y: number(record['y'], 0),
    w: number(record['w'], 160),
    h: number(record['h'], 80),
    rotation: number(record['rotation'], 0),
    color: text(record['color'], '#16202a'),
    fontSize: number(record['fontSize'], 16),
    align: isAlign(align) ? align : 'left',
    src: text(record['src'], ''),
    text: text(record['text'], ''),
    bold: flag(record['bold']),
    italic: flag(record['italic']),
    underline: flag(record['underline']),
  }
}

function readBlock(value: unknown): Block | null {
  const record = asRecord(value)
  if (record === null) return null
  const id = record['id']
  const type = record['type']
  if (typeof id !== 'string' || !isBlockType(type)) return null
  return { id, type, label: text(record['label'], id), props: readProps(record['props']) }
}

function readIdList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

/**
 * Restores a document from an untrusted string. Anything malformed produces
 * null rather than a throw or a half-built tree: a corrupted entry should cost
 * the user their saved page, not the ability to open the editor at all.
 */
export function deserializeDocument(raw: string): DocumentState | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const record = asRecord(parsed)
  if (record === null) return null
  const rootId = record['rootId']
  if (typeof rootId !== 'string') return null

  const found: Record<string, Block> = {}
  for (const entry of Array.isArray(record['blocks']) ? record['blocks'] : []) {
    const block = readBlock(entry)
    if (block !== null) found[block.id] = block
  }
  if (found[rootId] === undefined) return null

  const children: Record<string, readonly string[]> = {}
  const parents: Record<string, string> = {}
  const rawChildren = asRecord(record['children']) ?? {}
  for (const [parent, ids] of Object.entries(rawChildren)) {
    if (found[parent] === undefined) continue
    const kept = readIdList(ids).filter(id => found[id] !== undefined && id !== rootId)
    children[parent] = kept
    for (const id of kept) parents[id] = parent
  }

  // A block the adjacency lost would be unreachable and unselectable, so it is
  // dropped rather than restored into a tree it is not part of.
  const blocks: Record<string, Block> = {}
  for (const [id, block] of Object.entries(found)) {
    if (id !== rootId && parents[id] === undefined) continue
    blocks[id] = block
    children[id] ??= []
  }

  return { rootId, blocks, children, parents }
}

export function serializeDocument(doc: DocumentState): string {
  return JSON.stringify({
    rootId: doc.rootId,
    blocks: Object.values(doc.blocks),
    children: doc.children,
  })
}

export function saveDocument(doc: DocumentState, storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, serializeDocument(doc))
  } catch {
    // A full or disabled store is not worth interrupting an edit over.
  }
}

export function loadDocument(storage: Storage = localStorage): DocumentState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    return raw === null ? null : deserializeDocument(raw)
  } catch {
    return null
  }
}

export function clearDocument(storage: Storage = localStorage): void {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to recover from; the caller is discarding this state anyway.
  }
}
