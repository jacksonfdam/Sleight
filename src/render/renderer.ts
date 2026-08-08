import './blocks.css'
import { getChildren, subtreeIds } from '../core/document'
import type { EditorState } from '../core/store'
import type { Block, DocumentState } from '../core/types'

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

function createElement(block: Block): HTMLElement {
  const el = document.createElement('div')
  el.className = `sl-block sl-block--${block.type}`
  el.setAttribute(BLOCK_ATTR, block.id)
  el.dataset['blockType'] = block.type
  if (block.type === 'image') {
    const img = document.createElement('img')
    img.className = IMAGE_CLASS
    img.alt = block.label
    const placeholder = document.createElement('span')
    placeholder.className = PLACEHOLDER_CLASS
    el.append(img, placeholder)
  } else {
    const span = document.createElement('span')
    span.className = TEXT_CLASS
    el.append(span)
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

  if (block.type === 'image') {
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
  if (span && span.textContent !== props.text) span.textContent = props.text
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

  constructor(host: HTMLElement) {
    this.host = host
  }

  /** The element backing a block, for hit testing and measurement. */
  elementFor(id: string): HTMLElement | undefined {
    return this.elements.get(id)
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
  }
}
