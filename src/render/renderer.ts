import './blocks.css'
import { getChildren, subtreeIds } from '../core/document'
import type { EditorState } from '../core/store'
import type { Block, DocumentState } from '../core/types'
import { carriesText, textTagFor } from './semantics'

const TEXT_CLASS = 'sl-block__text'
const IMAGE_CLASS = 'sl-block__image'
const PLACEHOLDER_CLASS = 'sl-block__placeholder'

/** Attribute every hit test reads. Stripped on export. */
export const BLOCK_ATTR = 'data-block-id'

/** Walks up from an arbitrary node to the block element that owns it. */
export function blockIdAt(node: EventTarget | Node | null): string | null {
  if (!(node instanceof Element)) return null
  const owner = node.closest(`[${BLOCK_ATTR}]`)
  return owner?.getAttribute(BLOCK_ATTR) ?? null
}

/** The editable text node inside a block, when the block type has one. */
export function textNodeFor(el: Element): HTMLElement | null {
  return el.querySelector<HTMLElement>(`.${TEXT_CLASS}`)
}

export const HANDLE_ATTR = 'data-handle'

export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

export type HandleName = (typeof HANDLES)[number]

function isHandleName(value: string): value is HandleName {
  return (HANDLES as readonly string[]).includes(value)
}

/** The resize handle under a node, or null when the node is not a handle. */
export function handleAt(node: EventTarget | Node | null): HandleName | null {
  if (!(node instanceof Element)) return null
  const name = node.closest(`[${HANDLE_ATTR}]`)?.getAttribute(HANDLE_ATTR)
  return name !== null && name !== undefined && isHandleName(name) ? name : null
}

function createHandles(): HTMLElement {
  const group = document.createElement('div')
  group.className = 'sl-handles'
  for (const name of HANDLES) {
    const handle = document.createElement('div')
    handle.className = 'sl-handle'
    handle.setAttribute(HANDLE_ATTR, name)
    group.append(handle)
  }
  return group
}

function createElement(block: Block): HTMLElement {
  const el = document.createElement('div')
  el.className = `sl-block sl-block--${block.type}`
  el.setAttribute(BLOCK_ATTR, block.id)
  el.dataset['blockType'] = block.type
  if (carriesText(block.type)) {
    // The tag matches the export, so a heading is a real heading on screen too
    // and inherits the same weight and semantics the exported page will have.
    const text = document.createElement(textTagFor(block.type))
    text.className = TEXT_CLASS
    el.append(text)
  } else {
    const img = document.createElement('img')
    img.className = IMAGE_CLASS
    img.alt = block.label
    const placeholder = document.createElement('span')
    placeholder.className = PLACEHOLDER_CLASS
    el.append(img, placeholder)
  }
  return el
}

function applyProps(el: HTMLElement, block: Block): void {
  const { props } = block
  el.style.left = `${String(props.x)}px`
  el.style.top = `${String(props.y)}px`
  el.style.width = `${String(props.w)}px`
  el.style.height = `${String(props.h)}px`
  el.style.color = props.color
  el.style.fontSize = `${String(props.fontSize)}px`
  el.style.textAlign = props.align

  if (!carriesText(block.type)) {
    const img = el.querySelector<HTMLImageElement>(`.${IMAGE_CLASS}`)
    const placeholder = el.querySelector<HTMLElement>(`.${PLACEHOLDER_CLASS}`)
    const hasSrc = props.src.length > 0
    if (img) {
      img.hidden = !hasSrc
      if (hasSrc && img.getAttribute('src') !== props.src) img.src = props.src
    }
    if (placeholder) {
      placeholder.hidden = hasSrc
      placeholder.textContent = block.label
    }
    return
  }

  const span = el.querySelector<HTMLElement>(`.${TEXT_CLASS}`)
  // Never rewrite the node someone is typing into.
  if (span && !span.isContentEditable && span.textContent !== props.text) {
    span.textContent = props.text
  }
}

/** The canvas element is the root block; it is laid out by the shell, not by props. */
function applyRootProps(el: HTMLElement, block: Block): void {
  el.style.width = `${String(block.props.w)}px`
  el.style.height = `${String(block.props.h)}px`
}

export class Renderer {
  private readonly elements = new Map<string, HTMLElement>()
  private readonly host: HTMLElement
  private prev: EditorState | null = null
  private handles: HTMLElement | null = null

  constructor(host: HTMLElement) {
    this.host = host
  }

  /** The element backing a block, for hit testing and measurement. */
  elementFor(id: string): HTMLElement | undefined {
    return this.elements.get(id)
  }

  /**
   * Called once per frame from the render loop, never per event.
   * `elementFromPoint` forces a style flush, so calling it on every pointer move
   * costs frames during a drag for a result that cannot change more than once a
   * frame anyway. Block and handle come from that one call.
   */
  probe(clientX: number, clientY: number): { blockId: string | null; handle: HandleName | null } {
    const node = document.elementFromPoint(clientX, clientY)
    const id = blockIdAt(node)
    return {
      blockId: id === null || id === this.prev?.doc.rootId ? null : id,
      handle: handleAt(node),
    }
  }

  /**
   * The reducer returns the identical `Block` reference for anything it did not
   * touch, so a reference comparison is enough to skip the write. This keeps a
   * drag that moves one block from rewriting the styles of every other block.
   */
  render(state: EditorState): void {
    const prev = this.prev
    if (prev === null || prev.doc !== state.doc) {
      this.sync(state.doc, prev?.doc ?? null)
    }
    if (prev === null || prev.doc.children !== state.doc.children) {
      this.place(state.doc)
    }
    if (
      prev === null ||
      prev.selectedId !== state.selectedId ||
      prev.hoveredId !== state.hoveredId
    ) {
      this.mark(state, prev)
    }
    this.prev = state
  }

  /** Create and destroy elements so the map mirrors the document exactly. */
  private sync(doc: DocumentState, prev: DocumentState | null): void {
    const live = new Set(subtreeIds(doc, doc.rootId))

    for (const [id, el] of this.elements) {
      if (!live.has(id)) {
        el.remove()
        this.elements.delete(id)
      }
    }

    for (const id of live) {
      const block = doc.blocks[id]
      if (block === undefined) continue
      let el = this.elements.get(id)
      if (el === undefined) {
        el = id === doc.rootId ? this.createRoot(block) : createElement(block)
        this.elements.set(id, el)
      } else if (prev?.blocks[id] === block) {
        continue
      }
      if (id === doc.rootId) applyRootProps(el, block)
      else applyProps(el, block)
    }
  }

  private createRoot(block: Block): HTMLElement {
    const el = document.createElement('div')
    el.className = 'sl-canvas'
    el.setAttribute(BLOCK_ATTR, block.id)
    applyRootProps(el, block)
    this.host.append(el)
    return el
  }

  /** Re-seat children so DOM order matches document order. */
  private place(doc: DocumentState): void {
    for (const parentId of subtreeIds(doc, doc.rootId)) {
      const parent = this.elements.get(parentId)
      if (parent === undefined) continue
      for (const childId of getChildren(doc, parentId)) {
        const child = this.elements.get(childId)
        if (child !== undefined) parent.append(child)
      }
    }
  }

  private mark(state: EditorState, prev: EditorState | null): void {
    const touched = new Set<string>()
    for (const id of [prev?.selectedId, prev?.hoveredId, state.selectedId, state.hoveredId]) {
      if (typeof id === 'string') touched.add(id)
    }
    for (const id of touched) {
      const el = this.elements.get(id)
      if (el === undefined) continue
      el.classList.toggle('is-selected', id === state.selectedId)
      el.classList.toggle('is-hovered', id === state.hoveredId && id !== state.selectedId)
    }
    this.seatHandles(state.selectedId)
  }

  /**
   * One handle group is moved between blocks rather than built per selection, so
   * the handles inherit the selected block's box without any measurement.
   */
  private seatHandles(selectedId: string | null): void {
    this.handles ??= createHandles()
    const host = selectedId === null ? null : this.elements.get(selectedId)
    if (host === undefined || host === null) {
      this.handles.remove()
      return
    }
    host.append(this.handles)
  }
}
