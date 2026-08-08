import './inspector.css'
import type { EditorState } from '../core/store'
import type { Block, BlockType, PropPath } from '../core/types'

type FieldKind = 'number' | 'color' | 'align' | 'text' | 'url'

interface FieldSpec {
  readonly path: PropPath
  readonly label: string
  readonly kind: FieldKind
  readonly wide?: boolean
}

const GEOMETRY: readonly FieldSpec[] = [
  { path: 'x', label: 'X', kind: 'number' },
  { path: 'y', label: 'Y', kind: 'number' },
  { path: 'w', label: 'Width', kind: 'number' },
  { path: 'h', label: 'Height', kind: 'number' },
]

const TYPOGRAPHY: readonly FieldSpec[] = [
  { path: 'fontSize', label: 'Font size', kind: 'number' },
  { path: 'align', label: 'Align', kind: 'align' },
  { path: 'color', label: 'Colour', kind: 'color', wide: true },
  { path: 'text', label: 'Text', kind: 'text', wide: true },
]

const SOURCE: readonly FieldSpec[] = [
  { path: 'src', label: 'Image source', kind: 'url', wide: true },
]

/** Which properties are meaningful for each block type. */
const FIELDS: Record<BlockType, readonly FieldSpec[]> = {
  section: GEOMETRY,
  hero: [...GEOMETRY, ...TYPOGRAPHY],
  text: [...GEOMETRY, ...TYPOGRAPHY],
  image: [...GEOMETRY, ...SOURCE],
}

function createControl(spec: FieldSpec): HTMLElement {
  switch (spec.kind) {
    case 'number': {
      const input = document.createElement('input')
      input.type = 'number'
      input.step = '1'
      return input
    }
    case 'color': {
      const input = document.createElement('input')
      input.type = 'color'
      return input
    }
    case 'url': {
      const input = document.createElement('input')
      input.type = 'url'
      input.placeholder = 'https://'
      return input
    }
    case 'text': {
      const area = document.createElement('textarea')
      area.rows = 3
      return area
    }
    case 'align': {
      const select = document.createElement('select')
      for (const value of ['left', 'center', 'right'] as const) {
        const option = document.createElement('option')
        option.value = value
        option.textContent = value
        select.append(option)
      }
      return select
    }
  }
}

function controlValue(block: Block, spec: FieldSpec): string {
  const value = block.props[spec.path]
  return typeof value === 'number' ? String(value) : value
}

export interface InspectorOptions {
  readonly host: HTMLElement
}

/**
 * The panel is rebuilt only when the selected block changes identity or type.
 * Rebuilding on every property change would tear the focused input out from
 * under whoever is typing in it.
 */
export class Inspector {
  private readonly host: HTMLElement
  private readonly controls = new Map<PropPath, HTMLElement>()
  private renderedId: string | null = null
  private renderedType: BlockType | null = null

  constructor(options: InspectorOptions) {
    this.host = options.host
  }

  render(state: EditorState): void {
    const id = state.selectedId
    const block = id === null ? undefined : state.doc.blocks[id]

    if (block === undefined) {
      if (this.renderedId !== null || this.host.childElementCount === 0) this.renderEmpty()
      return
    }

    if (block.id !== this.renderedId || block.type !== this.renderedType) this.build(block)
    this.fill(block)
  }

  private renderEmpty(): void {
    this.host.replaceChildren()
    this.controls.clear()
    this.renderedId = null
    this.renderedType = null

    const empty = document.createElement('p')
    empty.className = 'sl-inspector__empty'
    empty.textContent = 'Select a block to edit its properties.'
    this.host.append(empty)
  }

  private build(block: Block): void {
    this.host.replaceChildren()
    this.controls.clear()
    this.renderedId = block.id
    this.renderedType = block.type

    const title = document.createElement('h2')
    title.className = 'sl-inspector__title'
    title.textContent = block.label
    const type = document.createElement('span')
    type.className = 'sl-inspector__type'
    type.textContent = block.type

    const fields = document.createElement('div')
    fields.className = 'sl-fields'
    for (const spec of FIELDS[block.type]) {
      const label = document.createElement('label')
      label.className = spec.wide === true ? 'sl-field sl-field--wide' : 'sl-field'
      const caption = document.createElement('span')
      caption.textContent = spec.label
      const control = createControl(spec)
      label.append(caption, control)
      fields.append(label)
      this.controls.set(spec.path, control)
    }

    this.host.append(title, type, fields)
  }

  private fill(block: Block): void {
    for (const spec of FIELDS[block.type]) {
      const control = this.controls.get(spec.path)
      if (control === undefined) continue
      // Never fight the field the user is currently typing into.
      if (document.activeElement === control) continue
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) {
        control.value = controlValue(block, spec)
      }
    }
  }
}
