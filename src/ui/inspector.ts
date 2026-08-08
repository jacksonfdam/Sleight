import './inspector.css'
import { isAlign } from '../core/document'
import type { EditorState } from '../core/store'
import type { Block, BlockType, Command, PropPath } from '../core/types'

type FieldKind = 'number' | 'color' | 'align' | 'text' | 'url' | 'flag'

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
  { path: 'rotation', label: 'Rotation', kind: 'number' },
]

const TYPOGRAPHY: readonly FieldSpec[] = [
  { path: 'fontSize', label: 'Font size', kind: 'number' },
  { path: 'align', label: 'Align', kind: 'align' },
  { path: 'bold', label: 'Bold', kind: 'flag' },
  { path: 'italic', label: 'Italic', kind: 'flag' },
  { path: 'underline', label: 'Underline', kind: 'flag' },
  { path: 'color', label: 'Colour', kind: 'color', wide: true },
  { path: 'text', label: 'Text', kind: 'text', wide: true },
]

const SOURCE: readonly FieldSpec[] = [
  { path: 'src', label: 'Image source', kind: 'url', wide: true },
]

const WRITTEN: readonly FieldSpec[] = [...GEOMETRY, ...TYPOGRAPHY]

/** Which properties are meaningful for each block type. */
const FIELDS: Record<BlockType, readonly FieldSpec[]> = {
  section: GEOMETRY,
  hero: WRITTEN,
  h1: WRITTEN,
  h2: WRITTEN,
  h3: WRITTEN,
  h4: WRITTEN,
  paragraph: WRITTEN,
  text: WRITTEN,
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
    case 'flag': {
      const input = document.createElement('input')
      input.type = 'checkbox'
      return input
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
  return typeof value === 'string' ? value : String(value)
}

export interface InspectorOptions {
  readonly host: HTMLElement
  readonly onCommand: (cmd: Command) => void
}

/**
 * Turns a raw field value into a command, or null when the field does not hold a
 * usable value yet — a half-typed number, an unrecognised alignment.
 */
function commandFor(id: string, spec: FieldSpec, raw: string): Command | null {
  switch (spec.path) {
    case 'x':
    case 'y':
    case 'w':
    case 'h':
    case 'rotation':
    case 'fontSize': {
      const value = Number.parseInt(raw, 10)
      return Number.isFinite(value) ? { op: 'set', id, path: spec.path, value } : null
    }
    case 'align':
      return isAlign(raw) ? { op: 'set', id, path: 'align', value: raw } : null
    case 'color':
      return { op: 'set', id, path: 'color', value: raw }
    case 'src':
      return { op: 'set', id, path: 'src', value: raw }
    case 'text':
      return { op: 'set', id, path: 'text', value: raw }
    case 'bold':
    case 'italic':
    case 'underline':
      return { op: 'set', id, path: spec.path, value: raw === 'true' }
  }
}

/** A checkbox carries its state on `checked`; `value` is the constant "on". */
function readControl(control: HTMLElement): string | null {
  if (control instanceof HTMLInputElement) {
    return control.type === 'checkbox' ? String(control.checked) : control.value
  }
  if (control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
    return control.value
  }
  return null
}

/**
 * The panel is rebuilt only when the selected block changes identity or type.
 * Rebuilding on every property change would tear the focused input out from
 * under whoever is typing in it.
 */
export class Inspector {
  private readonly options: InspectorOptions
  private readonly host: HTMLElement
  private readonly controls = new Map<PropPath, HTMLElement>()
  private renderedId: string | null = null
  private renderedType: BlockType | null = null

  constructor(options: InspectorOptions) {
    this.options = options
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
      label.className = 'sl-field'
      if (spec.wide === true) label.classList.add('sl-field--wide')
      if (spec.kind === 'flag') label.classList.add('sl-field--flag')
      const caption = document.createElement('span')
      caption.textContent = spec.label
      const control = createControl(spec)
      // `input` rather than `change` so a dragged colour swatch or a held arrow
      // key shows on the canvas while it is happening.
      control.addEventListener('input', () => {
        this.emit(block.id, spec, control)
      })
      label.append(caption, control)
      fields.append(label)
      this.controls.set(spec.path, control)
    }

    this.host.append(title, type, fields)
  }

  private emit(id: string, spec: FieldSpec, control: HTMLElement): void {
    const raw = readControl(control)
    if (raw === null) return
    const cmd = commandFor(id, spec, raw)
    if (cmd !== null) this.options.onCommand(cmd)
  }

  private fill(block: Block): void {
    for (const spec of FIELDS[block.type]) {
      const control = this.controls.get(spec.path)
      if (control === undefined) continue
      // Never fight the field the user is currently typing into.
      if (document.activeElement === control) continue
      if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        control.checked = block.props[spec.path] === true
      } else if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) {
        control.value = controlValue(block, spec)
      }
    }
  }
}
