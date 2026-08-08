import type { Align, Block, BlockProps, BlockType, DocumentState } from './types'

export const ROOT_ID = 'root'

const BASE_PROPS: BlockProps = {
  x: 0,
  y: 0,
  w: 320,
  h: 160,
  color: '#1f2933',
  fontSize: 16,
  align: 'left',
  src: '',
  text: '',
}

/** Every type, in the order the toolbar and the ordinal grammar walk them. */
export const BLOCK_TYPES = [
  'section',
  'hero',
  'h1',
  'h2',
  'h3',
  'h4',
  'paragraph',
  'text',
  'image',
] as const satisfies readonly BlockType[]

const TYPE_DEFAULTS: Record<BlockType, Partial<BlockProps>> = {
  section: { w: 640, h: 280, color: '#5b6b7c' },
  hero: { w: 640, h: 260, color: '#0f766e', fontSize: 34, align: 'center', text: 'Hero headline' },
  h1: { w: 560, h: 64, fontSize: 40, text: 'Heading one' },
  h2: { w: 520, h: 52, fontSize: 30, text: 'Heading two' },
  h3: { w: 480, h: 44, fontSize: 24, text: 'Heading three' },
  h4: { w: 440, h: 38, fontSize: 20, text: 'Heading four' },
  paragraph: { w: 420, h: 96, fontSize: 16, text: 'Paragraph text' },
  text: { w: 320, h: 96, fontSize: 16, text: 'Body copy' },
  image: { w: 280, h: 180, src: '' },
}

/** The name a newly inserted block carries in the inspector and the grammar. */
export const TYPE_LABELS: Record<BlockType, string> = {
  section: 'Section',
  hero: 'Hero',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  paragraph: 'Paragraph',
  text: 'Text',
  image: 'Image',
}

export function defaultProps(type: BlockType, overrides: Partial<BlockProps> = {}): BlockProps {
  return { ...BASE_PROPS, ...TYPE_DEFAULTS[type], ...overrides }
}

export function createBlock(
  id: string,
  type: BlockType,
  label: string,
  overrides: Partial<BlockProps> = {},
): Block {
  return { id, type, label, props: defaultProps(type, overrides) }
}

export function emptyDocument(): DocumentState {
  const root = createBlock(ROOT_ID, 'section', 'Canvas', { x: 0, y: 0, w: 960, h: 640 })
  return {
    rootId: ROOT_ID,
    blocks: { [ROOT_ID]: root },
    children: { [ROOT_ID]: [] },
    parents: {},
  }
}

/** The document a first-time visitor lands on, so the canvas is never blank. */
export function starterDocument(): DocumentState {
  const root = createBlock(ROOT_ID, 'section', 'Canvas', { x: 0, y: 0, w: 960, h: 640 })
  const hero = createBlock('hero', 'hero', 'Hero', {
    x: 48,
    y: 48,
    w: 560,
    h: 220,
    text: 'Sleight',
    fontSize: 44,
    align: 'center',
  })
  const intro = createBlock('intro', 'text', 'Intro copy', {
    x: 48,
    y: 300,
    w: 400,
    h: 120,
    text: 'Move a block with the mouse, with a pinch, or by asking for it out loud.',
    fontSize: 18,
  })
  const shot = createBlock('shot', 'image', 'Image', { x: 480, y: 300, w: 280, h: 180 })

  return {
    rootId: ROOT_ID,
    blocks: { [ROOT_ID]: root, hero, intro, shot },
    children: { [ROOT_ID]: ['hero', 'intro', 'shot'], hero: [], intro: [], shot: [] },
    parents: { hero: ROOT_ID, intro: ROOT_ID, shot: ROOT_ID },
  }
}

export function getBlock(doc: DocumentState, id: string): Block | undefined {
  return doc.blocks[id]
}

export function getChildren(doc: DocumentState, id: string): readonly string[] {
  return doc.children[id] ?? []
}

export function getParent(doc: DocumentState, id: string): string | undefined {
  return doc.parents[id]
}

/** True when `ancestorId` sits on the path from `id` to the root. */
export function isAncestor(doc: DocumentState, ancestorId: string, id: string): boolean {
  let cursor = getParent(doc, id)
  while (cursor !== undefined) {
    if (cursor === ancestorId) return true
    cursor = getParent(doc, cursor)
  }
  return false
}

/** `id` followed by every descendant, in depth-first order. */
export function subtreeIds(doc: DocumentState, id: string): string[] {
  const out: string[] = []
  const stack: string[] = [id]
  while (stack.length > 0) {
    const next = stack.pop()
    if (next === undefined) break
    out.push(next)
    const kids = getChildren(doc, next)
    for (let i = kids.length - 1; i >= 0; i -= 1) {
      const kid = kids[i]
      if (kid !== undefined) stack.push(kid)
    }
  }
  return out
}

/** Every block except the root, in depth-first order. */
export function listBlocks(doc: DocumentState): Block[] {
  const out: Block[] = []
  for (const id of subtreeIds(doc, doc.rootId)) {
    if (id === doc.rootId) continue
    const block = getBlock(doc, id)
    if (block !== undefined) out.push(block)
  }
  return out
}

/** The first block of a given type, used by `select the hero` style commands. */
export function findByType(doc: DocumentState, type: BlockType): Block | undefined {
  return listBlocks(doc).find(block => block.type === type)
}

/** Absolute position of a block, accumulated through its ancestors. */
export function absoluteOrigin(doc: DocumentState, id: string): { x: number; y: number } {
  let x = 0
  let y = 0
  let cursor: string | undefined = id
  while (cursor !== undefined && cursor !== doc.rootId) {
    const block = getBlock(doc, cursor)
    if (block === undefined) break
    x += block.props.x
    y += block.props.y
    cursor = getParent(doc, cursor)
  }
  return { x, y }
}

export function isAlign(value: unknown): value is Align {
  return value === 'left' || value === 'center' || value === 'right'
}

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value)
}
