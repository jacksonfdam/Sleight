import './history.css'
import type { LogEntry } from '../core/history-log'
import type { Command, DocumentState } from '../core/types'

/** Short human names for the property paths, so a line reads as a sentence. */
const PROP_NAMES: Record<string, string> = {
  x: 'x',
  y: 'y',
  w: 'width',
  h: 'height',
  rotation: 'rotation',
  color: 'colour',
  fontSize: 'font size',
  align: 'align',
  src: 'source',
  text: 'text',
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
}

/** A label if the block is still there, else the bare id it used to have. */
function nameOf(doc: DocumentState, id: string): string {
  return doc.blocks[id]?.label ?? id
}

/** Long values are cut, because a source URL is longer than the panel is wide. */
function shorten(value: string, max = 28): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

function describeValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  if (typeof value === 'number') return String(value)
  return shorten(value)
}

/**
 * One line of plain English per command. It reads the document for block labels,
 * so a line says "Hero width 600" rather than repeating an internal id back at
 * someone who never chose it.
 */
export function describeCommand(cmd: Command, doc: DocumentState): string {
  switch (cmd.op) {
    case 'set':
      return `${nameOf(doc, cmd.id)} · ${PROP_NAMES[cmd.path] ?? cmd.path} ${describeValue(cmd.value)}`
    case 'nudge': {
      const sign = cmd.delta > 0 ? '+' : ''
      return `${nameOf(doc, cmd.id)} · ${PROP_NAMES[cmd.path] ?? cmd.path} ${sign}${String(cmd.delta)}`
    }
    case 'insert':
      return `Added ${cmd.block.label}`
    case 'remove':
      return `Deleted ${nameOf(doc, cmd.id)}`
    case 'move':
      return `Moved ${nameOf(doc, cmd.id)}`
    case 'center': {
      const where =
        cmd.axis === 'both' ? 'on the canvas' : cmd.axis === 'x' ? 'horizontally' : 'vertically'
      return `Centred ${nameOf(doc, cmd.id)} ${where}`
    }
    case 'scale': {
      const what = cmd.of === 'font' ? 'type' : 'size'
      return `${nameOf(doc, cmd.id)} · ${what} ×${String(Math.round(cmd.factor * 100) / 100)}`
    }
    case 'select':
      return cmd.id === null ? 'Deselected' : `Selected ${nameOf(doc, cmd.id)}`
    case 'undo':
      return 'Undo'
    case 'redo':
      return 'Redo'
    case 'hover':
    case 'noop':
      return 'Not understood'
  }
}

function formatTime(ts: number, origin: number): string {
  const seconds = Math.max(0, Math.round((ts - origin) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export interface HistoryPanelOptions {
  readonly host: HTMLElement
  readonly onClear: () => void
  /** The clock the timestamps are measured against, so entries read as elapsed. */
  readonly origin?: number
}

/**
 * The running record, newest first.
 *
 * Newest first because the interesting line is always the last thing that
 * happened; an appended list would need scrolling to the bottom after every
 * command, which fights anyone reading further back.
 */
export class HistoryPanel {
  private readonly list: HTMLElement
  private readonly empty: HTMLElement
  private readonly origin: number

  constructor(options: HistoryPanelOptions) {
    this.origin = options.origin ?? 0

    const header = document.createElement('div')
    header.className = 'sl-history__header'
    const title = document.createElement('h2')
    title.className = 'sl-history__title'
    title.textContent = 'History'

    const clear = document.createElement('button')
    clear.type = 'button'
    clear.className = 'sl-button sl-button--compact'
    clear.setAttribute('aria-label', 'Clear the history list')
    clear.textContent = 'Clear'
    clear.addEventListener('click', options.onClear)
    header.append(title, clear)

    this.list = document.createElement('ol')
    this.list.className = 'sl-history__list'
    // Announced politely: it narrates work the user just did, and should not
    // interrupt whatever they are doing next.
    this.list.setAttribute('aria-live', 'polite')

    this.empty = document.createElement('p')
    this.empty.className = 'sl-history__empty'
    this.empty.textContent = 'Every command lands here as you work.'

    options.host.append(header, this.empty, this.list)
  }

  render(entries: readonly LogEntry[]): void {
    this.empty.hidden = entries.length > 0
    this.list.replaceChildren()

    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]
      if (entry === undefined) continue
      this.list.append(this.row(entry))
    }
  }

  private row(entry: LogEntry): HTMLElement {
    const item = document.createElement('li')
    item.className = 'sl-history__row'
    item.dataset['source'] = entry.source
    if (entry.unheard !== undefined) item.dataset['unheard'] = 'yes'

    const time = document.createElement('span')
    time.className = 'sl-history__time'
    time.textContent = formatTime(entry.ts, this.origin)

    const source = document.createElement('span')
    source.className = 'sl-history__source'
    source.textContent = entry.source
    source.title = `From the ${entry.source}`

    const text = document.createElement('span')
    text.className = 'sl-history__text'
    text.textContent = entry.unheard === undefined ? entry.text : `“${shorten(entry.unheard, 40)}”`

    item.append(time, source, text)

    if (entry.count > 1) {
      const count = document.createElement('span')
      count.className = 'sl-history__count'
      count.textContent = `×${String(entry.count)}`
      count.title = `${String(entry.count)} steps in one gesture`
      item.append(count)
    }
    return item
  }
}
