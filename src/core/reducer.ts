import { getChildren, isAncestor, subtreeIds } from './document'
import type { Block, BlockProps, DocCommand, DocumentState, NumericPath, SetCommand } from './types'

/**
 * Bounds applied to every numeric property. They exist so that a runaway gesture
 * or a bad model response cannot produce a block that is impossible to grab
 * again with the pointer.
 */
/** Every numeric path except the one that wraps instead of stopping. */
type ClampedPath = Exclude<NumericPath, 'rotation'>

const LIMITS: Record<ClampedPath, { readonly min: number; readonly max: number }> = {
  x: { min: -4000, max: 8000 },
  y: { min: -4000, max: 8000 },
  w: { min: 16, max: 4000 },
  h: { min: 16, max: 4000 },
  fontSize: { min: 8, max: 200 },
}

function clamp(path: ClampedPath, value: number): number {
  const limit = LIMITS[path]
  if (!Number.isFinite(value)) return limit.min
  return Math.min(limit.max, Math.max(limit.min, Math.round(value)))
}

/**
 * Rotation wraps rather than clamping. Nudging past a full turn should carry on
 * turning, and a clamp at 360 would leave a block stuck one degree short of
 * where it started with no way to nudge past it.
 */
function normaliseAngle(value: number): number {
  if (!Number.isFinite(value)) return 0
  const wrapped = Math.round(value) % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

function writeNumeric(props: BlockProps, path: NumericPath, raw: number): BlockProps {
  if (path === 'rotation') {
    const angle = normaliseAngle(raw)
    return props.rotation === angle ? props : { ...props, rotation: angle }
  }
  const value = clamp(path, raw)
  switch (path) {
    case 'x':
      return props.x === value ? props : { ...props, x: value }
    case 'y':
      return props.y === value ? props : { ...props, y: value }
    case 'w':
      return props.w === value ? props : { ...props, w: value }
    case 'h':
      return props.h === value ? props : { ...props, h: value }
    case 'fontSize':
      return props.fontSize === value ? props : { ...props, fontSize: value }
  }
}

function applySet(props: BlockProps, cmd: SetCommand): BlockProps {
  switch (cmd.path) {
    case 'x':
    case 'y':
    case 'w':
    case 'h':
    case 'rotation':
    case 'fontSize':
      return writeNumeric(props, cmd.path, cmd.value)
    case 'color':
      return props.color === cmd.value ? props : { ...props, color: cmd.value }
    case 'align':
      return props.align === cmd.value ? props : { ...props, align: cmd.value }
    case 'src':
      return props.src === cmd.value ? props : { ...props, src: cmd.value }
    case 'text':
      return props.text === cmd.value ? props : { ...props, text: cmd.value }
  }
}

function replaceBlock(doc: DocumentState, block: Block): DocumentState {
  return { ...doc, blocks: { ...doc.blocks, [block.id]: block } }
}

function withoutIndex(ids: readonly string[], index: number): string[] {
  return ids.filter((_, i) => i !== index)
}

function insertAt(ids: readonly string[], id: string, index: number): string[] {
  const next = ids.slice()
  next.splice(Math.min(Math.max(index, 0), next.length), 0, id)
  return next
}

export function reduce(doc: DocumentState, cmd: DocCommand): DocumentState {
  switch (cmd.op) {
    case 'noop':
      return doc

    case 'set': {
      const block = doc.blocks[cmd.id]
      if (block === undefined) return doc
      const props = applySet(block.props, cmd)
      if (props === block.props) return doc
      return replaceBlock(doc, { ...block, props })
    }

    case 'nudge': {
      const block = doc.blocks[cmd.id]
      if (block === undefined) return doc
      const props = writeNumeric(block.props, cmd.path, block.props[cmd.path] + cmd.delta)
      if (props === block.props) return doc
      return replaceBlock(doc, { ...block, props })
    }

    case 'insert': {
      if (doc.blocks[cmd.parent] === undefined) return doc
      if (doc.blocks[cmd.block.id] !== undefined) return doc
      return {
        ...doc,
        blocks: { ...doc.blocks, [cmd.block.id]: cmd.block },
        children: {
          ...doc.children,
          [cmd.parent]: insertAt(getChildren(doc, cmd.parent), cmd.block.id, cmd.index),
          [cmd.block.id]: [],
        },
        parents: { ...doc.parents, [cmd.block.id]: cmd.parent },
      }
    }

    case 'move': {
      if (cmd.id === doc.rootId) return doc
      if (doc.blocks[cmd.id] === undefined) return doc
      if (doc.blocks[cmd.parent] === undefined) return doc
      // A block cannot be reparented into itself or into its own subtree.
      if (cmd.parent === cmd.id || isAncestor(doc, cmd.id, cmd.parent)) return doc

      const from = doc.parents[cmd.id]
      if (from === undefined) return doc
      const siblings = getChildren(doc, from)
      const currentIndex = siblings.indexOf(cmd.id)
      if (currentIndex === -1) return doc

      const target = Math.min(Math.max(cmd.index, 0), getChildren(doc, cmd.parent).length)
      if (from === cmd.parent && (target === currentIndex || target === currentIndex + 1))
        return doc

      const detached = withoutIndex(siblings, currentIndex)
      const destination = from === cmd.parent ? detached : getChildren(doc, cmd.parent)
      const adjusted = from === cmd.parent && target > currentIndex ? target - 1 : target

      return {
        ...doc,
        children: {
          ...doc.children,
          [from]: detached,
          [cmd.parent]: insertAt(destination, cmd.id, adjusted),
        },
        parents: { ...doc.parents, [cmd.id]: cmd.parent },
      }
    }

    case 'remove': {
      if (cmd.id === doc.rootId) return doc
      if (doc.blocks[cmd.id] === undefined) return doc
      const from = doc.parents[cmd.id]
      if (from === undefined) return doc

      const doomed = new Set(subtreeIds(doc, cmd.id))
      const blocks: Record<string, Block> = {}
      for (const [id, block] of Object.entries(doc.blocks)) {
        if (!doomed.has(id)) blocks[id] = block
      }
      const children: Record<string, readonly string[]> = {}
      for (const [id, kids] of Object.entries(doc.children)) {
        if (doomed.has(id)) continue
        children[id] = id === from ? kids.filter(kid => kid !== cmd.id) : kids
      }
      const parents: Record<string, string> = {}
      for (const [id, parent] of Object.entries(doc.parents)) {
        if (!doomed.has(id)) parents[id] = parent
      }
      return { rootId: doc.rootId, blocks, children, parents }
    }
  }
}
