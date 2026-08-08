/**
 * Heading levels are separate types rather than one heading type with a level
 * property. The export is HTML, so the level decides the element tag, and a tag
 * is not something a block should be able to hold an out-of-range value for.
 */
export type BlockType =
  'section' | 'hero' | 'h1' | 'h2' | 'h3' | 'h4' | 'paragraph' | 'text' | 'image'

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
  /** Clockwise degrees about the block's centre, normalised to 0 through 359. */
  readonly rotation: number
  readonly color: string
  readonly fontSize: number
  readonly align: Align
  readonly src: string
  readonly text: string
  readonly bold: boolean
  readonly italic: boolean
  readonly underline: boolean
}

export type PropPath =
  | 'x'
  | 'y'
  | 'w'
  | 'h'
  | 'rotation'
  | 'color'
  | 'fontSize'
  | 'align'
  | 'src'
  | 'text'
  | 'bold'
  | 'italic'
  | 'underline'

/**
 * Paths that are either on or off. They are separate booleans rather than one
 * style string because they combine: bold italic underline is three independent
 * answers, not a fourth value.
 */
export type FlagPath = 'bold' | 'italic' | 'underline'

/** Paths whose values can be shifted by a relative delta. */
export type NumericPath = 'x' | 'y' | 'w' | 'h' | 'fontSize' | 'rotation'

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

/**
 * A `set` per property path, so that the compiler rejects a value whose type does
 * not match its path — `{ path: 'align', value: 12 }` will not build.
 */
export type SetCommand = {
  [K in PropPath]: {
    readonly op: 'set'
    readonly id: string
    readonly path: K
    readonly value: BlockProps[K]
  }
}[PropPath]

/** Commands that mutate the document. These are the reducer's entire input. */
export type DocCommand =
  | SetCommand
  | {
      readonly op: 'nudge'
      readonly id: string
      readonly path: NumericPath
      readonly delta: number
    }
  | {
      readonly op: 'insert'
      readonly parent: string
      readonly block: Block
      readonly index: number
    }
  | { readonly op: 'move'; readonly id: string; readonly parent: string; readonly index: number }
  | { readonly op: 'remove'; readonly id: string }
  | { readonly op: 'noop' }

/**
 * Commands that change editor shell state rather than the document. They travel
 * the same bus so that an adapter never needs a second channel, but they are not
 * undoable and never reach the reducer.
 */
export type ShellCommand =
  | { readonly op: 'select'; readonly id: string | null }
  | { readonly op: 'hover'; readonly id: string | null }
  | { readonly op: 'undo' }
  | { readonly op: 'redo' }

export type Command = DocCommand | ShellCommand

export type IntentSource = 'pointer' | 'hand' | 'voice'

export interface Intent {
  readonly cmd: Command
  readonly source: IntentSource
  /** Groups a continuous gesture into a single undo step. */
  readonly txn?: string
  readonly ts: number
}
