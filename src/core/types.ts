export type BlockType = 'section' | 'hero' | 'text' | 'image'

export type Align = 'left' | 'center' | 'right'

/**
 * The complete set of editable properties. Every block carries every property so
 * that a `PropPath` is always valid for any block; the renderer decides which
 * ones are meaningful for a given block type.
 */
export interface BlockProps {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly color: string
  readonly fontSize: number
  readonly align: Align
  readonly src: string
  readonly text: string
}

export type PropPath = 'x' | 'y' | 'w' | 'h' | 'color' | 'fontSize' | 'align' | 'src' | 'text'

/** Paths whose values can be shifted by a relative delta. */
export type NumericPath = 'x' | 'y' | 'w' | 'h' | 'fontSize'

export type PropValue = BlockProps[PropPath]

export interface Block {
  readonly id: string
  readonly type: BlockType
  readonly label: string
  readonly props: BlockProps
}

/**
 * The block tree, stored normalised. Adjacency lives in `children` and `parents`
 * rather than inside `Block` so that patching one block's properties never
 * forces a rewrite of its subtree.
 */
export interface DocumentState {
  readonly rootId: string
  readonly blocks: Readonly<Record<string, Block>>
  readonly children: Readonly<Record<string, readonly string[]>>
  readonly parents: Readonly<Record<string, string>>
}
