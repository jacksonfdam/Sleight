import type { BlockType } from '../core/types'

/**
 * The element that carries a block's text. The editor and the export read the
 * same table, so what is on screen and what lands in the exported file can never
 * disagree about whether a block is a heading or a paragraph.
 *
 * A block that shows no text at all still names a tag here; callers ask
 * `carriesText` first rather than treating an entry as permission to render one.
 */
const TEXT_TAG: Record<BlockType, string> = {
  section: 'span',
  hero: 'span',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  paragraph: 'p',
  text: 'span',
  image: 'span',
}

export function textTagFor(type: BlockType): string {
  return TEXT_TAG[type]
}

export function carriesText(type: BlockType): boolean {
  return type !== 'image'
}

/** Every tag a block's text can be rendered into, for stylesheet selectors. */
export const TEXT_TAGS: readonly string[] = [...new Set(Object.values(TEXT_TAG))]
