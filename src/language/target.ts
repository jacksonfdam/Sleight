import { listBlocks } from '../core/document'
import type { Block, BlockType, DocumentState } from '../core/types'

/**
 * Spoken names for a block type. The first entry is what the word means when a
 * block is being created; the whole list is what it matches when a block is
 * being found, so `heading` inserts an h1 but selects any heading level.
 */
const TYPE_WORDS: Record<string, readonly BlockType[]> = {
  section: ['section'],
  hero: ['hero'],
  banner: ['hero'],
  heading: ['h1', 'h2', 'h3', 'h4'],
  headline: ['h1', 'h2', 'h3', 'h4'],
  header: ['h1', 'h2', 'h3', 'h4'],
  title: ['h1'],
  h1: ['h1'],
  'h 1': ['h1'],
  'h one': ['h1'],
  'heading one': ['h1'],
  'heading 1': ['h1'],
  subtitle: ['h2'],
  subheading: ['h2'],
  h2: ['h2'],
  'h 2': ['h2'],
  'h two': ['h2'],
  'heading two': ['h2'],
  'heading 2': ['h2'],
  h3: ['h3'],
  'h 3': ['h3'],
  'h three': ['h3'],
  'heading three': ['h3'],
  'heading 3': ['h3'],
  h4: ['h4'],
  'h 4': ['h4'],
  'h four': ['h4'],
  'heading four': ['h4'],
  'heading 4': ['h4'],
  paragraph: ['paragraph', 'text'],
  copy: ['paragraph', 'text'],
  body: ['paragraph', 'text'],
  text: ['paragraph', 'text'],
  image: ['image'],
  picture: ['image'],
  photo: ['image'],
}

const ORDINALS: Record<string, number> = {
  first: 0,
  second: 1,
  third: 2,
  fourth: 3,
  fifth: 4,
  sixth: 5,
  seventh: 6,
  eighth: 7,
  ninth: 8,
  tenth: 9,
}

/** Words that mean "whatever is selected right now". */
const SELF = /^(?:it|this|that|current|selected|selection|this one|the current block)$/

/** Words for a position in the canvas order rather than a type. */
const RELATIVE = /^(?<word>next|previous|prior|last|first)(?: block| one| element)?$/

function normalise(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripArticle(phrase: string): string {
  return phrase.replace(/^(?:the|a|an|my) /, '')
}

/**
 * The plural is trimmed here rather than in `stripArticle` so that it can only
 * ever turn one vocabulary word into another. Trimming it up front would maul
 * every phrase that legitimately ends in an s, `previous` among them.
 */
function typesFor(phrase: string): readonly BlockType[] | null {
  return TYPE_WORDS[phrase] ?? TYPE_WORDS[phrase.replace(/s$/, '')] ?? null
}

/** The type a spoken word creates, or null when the word names no type. */
export function blockTypeFor(phrase: string): BlockType | null {
  return typesFor(stripArticle(normalise(phrase)))?.[0] ?? null
}

function byRelative(word: string, blocks: readonly Block[], selected: Block | null): Block | null {
  if (blocks.length === 0) return null
  if (word === 'first') return blocks[0] ?? null
  if (word === 'last') return blocks[blocks.length - 1] ?? null

  // With nothing selected there is no "next", so the walk starts at the edge it
  // would have wrapped to anyway.
  const from = selected === null ? -1 : blocks.indexOf(selected)
  const step = word === 'next' ? 1 : -1
  const at = (from + step + blocks.length) % blocks.length
  return blocks[at] ?? null
}

function byLabel(phrase: string, blocks: readonly Block[]): Block | null {
  const exact = blocks.find(block => block.label.toLowerCase() === phrase)
  if (exact !== undefined) return exact
  const id = blocks.find(block => block.id.toLowerCase() === phrase)
  if (id !== undefined) return id
  const starts = blocks.find(block => block.label.toLowerCase().startsWith(phrase))
  if (starts !== undefined) return starts
  return blocks.find(block => block.label.toLowerCase().includes(phrase)) ?? null
}

/**
 * Resolves a spoken phrase to one block. Matching runs from the least ambiguous
 * reading to the most: a pronoun, then a position, then a type with an optional
 * ordinal, and only then the block's own label. A label is tried last because
 * labels are free text and would otherwise shadow the fixed vocabulary the rest
 * of the grammar is built on.
 */
export function resolveTarget(
  doc: DocumentState,
  phrase: string,
  selectedId: string | null,
): Block | null {
  const text = normalise(phrase)
  if (text.length === 0) return null

  const blocks = listBlocks(doc)
  const selected = selectedId === null ? null : (doc.blocks[selectedId] ?? null)

  const bare = stripArticle(text)
  if (SELF.test(text) || SELF.test(bare)) return selected

  const relative = RELATIVE.exec(bare)
  if (relative?.groups?.['word'] !== undefined) {
    return byRelative(relative.groups['word'], blocks, selected)
  }

  const ordered = /^(?<ord>[a-z]+) (?<rest>.+)$/.exec(bare)
  const ord = ordered?.groups?.['ord']
  const rest = ordered?.groups?.['rest']
  if (ord !== undefined && rest !== undefined) {
    const index = ord === 'last' ? -1 : ORDINALS[ord]
    const types = typesFor(stripArticle(rest))
    if (index !== undefined && types !== null) {
      const matches = blocks.filter(block => types.includes(block.type))
      return (index === -1 ? matches[matches.length - 1] : matches[index]) ?? null
    }
  }

  const types = typesFor(bare)
  if (types !== null) return blocks.find(block => types.includes(block.type)) ?? null

  return byLabel(text, blocks) ?? byLabel(bare, blocks)
}
