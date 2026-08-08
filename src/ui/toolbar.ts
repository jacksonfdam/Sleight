import './toolbar.css'
import type { CapabilityTier } from '../language/parser'
import { TYPE_LABELS } from '../core/document'
import type { BlockType } from '../core/types'

/**
 * The block types offered as buttons. Every other type is still reachable by
 * voice; these are the ones worth a permanent seat in the toolbar.
 */
const INSERTS: readonly { readonly type: BlockType; readonly label: string }[] = [
  { type: 'h1', label: 'H1' },
  { type: 'h2', label: 'H2' },
  { type: 'h3', label: 'H3' },
  { type: 'h4', label: 'H4' },
  { type: 'paragraph', label: 'Text' },
  { type: 'image', label: 'Image' },
]

const TIERS: Record<CapabilityTier, { readonly badge: string; readonly detail: string }> = {
  loading: {
    badge: 'Starting',
    detail: 'Checking what this browser can do. Mouse and hand editing already work.',
  },
  full: {
    badge: 'Full',
    detail: 'Natural-language voice commands are parsed on this device.',
  },
  grammar: {
    badge: 'Grammar',
    detail:
      'The built-in language model is unavailable here, so voice commands use the documented grammar.',
  },
  manual: {
    badge: 'Manual',
    detail:
      'Speech recognition is unavailable in this browser. Mouse and hand editing are unaffected.',
  },
}

export interface ToolbarOptions {
  readonly host: HTMLElement
  readonly statusHost: HTMLElement
  /** Hidden entirely when speech recognition is missing, rather than shown broken. */
  readonly speechSupported: boolean
  readonly cameraSupported: boolean
  readonly onMicToggle: (active: boolean) => void
  readonly onCameraToggle: (active: boolean) => void
  readonly onInsert: (type: BlockType) => void
  readonly onDelete: () => void
  readonly onUndo: () => void
  readonly onRedo: () => void
  readonly onExport: () => void
}

/** A labelled cluster, so the toolbar reads as groups rather than a button row. */
function createGroup(label: string): HTMLElement {
  const group = document.createElement('div')
  group.className = 'sl-group'
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', label)
  return group
}

function createAction(label: string, description: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'sl-button'
  button.setAttribute('aria-label', description)
  button.textContent = label
  return button
}

function createToggle(label: string, description: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'sl-button'
  button.setAttribute('aria-pressed', 'false')
  button.setAttribute('aria-label', description)

  const dot = document.createElement('span')
  dot.className = 'sl-button__dot'
  const text = document.createElement('span')
  text.textContent = label

  button.append(dot, text)
  return button
}

export class Toolbar {
  private readonly mic: HTMLButtonElement | null = null
  private readonly camera: HTMLButtonElement | null = null
  private readonly notice: HTMLElement
  private readonly heard: HTMLElement
  private readonly remove: HTMLButtonElement
  private readonly undo: HTMLButtonElement
  private readonly redo: HTMLButtonElement
  private readonly badge: HTMLElement
  private readonly detail: HTMLElement

  constructor(options: ToolbarOptions) {
    const spacer = options.host.querySelector('.sl-toolbar__spacer')

    this.badge = document.createElement('span')
    this.badge.className = 'sl-badge'
    options.host.append(this.badge)

    this.detail = document.createElement('span')
    options.statusHost.append(this.detail)

    this.notice = document.createElement('span')
    this.notice.className = 'sl-notice'
    options.statusHost.append(this.notice)

    this.heard = document.createElement('span')
    this.heard.className = 'sl-heard'
    options.statusHost.append(this.heard)

    const inserts = createGroup('Add a block')
    for (const entry of INSERTS) {
      const name = TYPE_LABELS[entry.type].toLowerCase()
      const article = /^[aeiou]/.test(name) ? 'an' : 'a'
      const button = createAction(entry.label, `Add ${article} ${name}`)
      button.classList.add('sl-button--compact')
      button.addEventListener('click', () => {
        options.onInsert(entry.type)
      })
      inserts.append(button)
    }
    spacer?.before(inserts)

    this.remove = createAction('Delete', 'Delete the selected block')
    this.remove.classList.add('sl-button--danger')
    this.remove.addEventListener('click', options.onDelete)
    spacer?.before(this.remove)

    this.undo = createAction('Undo', 'Undo the last change')
    this.undo.addEventListener('click', options.onUndo)
    this.redo = createAction('Redo', 'Redo the last undone change')
    this.redo.addEventListener('click', options.onRedo)
    spacer?.before(this.undo, this.redo)

    const exportAction = createAction('Export', 'Download the page as standalone HTML')
    exportAction.addEventListener('click', options.onExport)
    options.host.append(exportAction)

    if (options.cameraSupported) {
      const camera = createToggle('Camera', 'Turn hand tracking on or off')
      camera.addEventListener('click', () => {
        options.onCameraToggle(camera.getAttribute('aria-pressed') !== 'true')
      })
      spacer?.before(camera)
      this.camera = camera
    }

    if (options.speechSupported) {
      const mic = createToggle('Microphone', 'Turn the microphone on or off')
      mic.addEventListener('click', () => {
        const next = mic.getAttribute('aria-pressed') !== 'true'
        options.onMicToggle(next)
      })
      spacer?.before(mic)
      this.mic = mic
    }
  }

  setMicActive(active: boolean): void {
    this.mic?.setAttribute('aria-pressed', active ? 'true' : 'false')
  }

  setHistory(canUndo: boolean, canRedo: boolean): void {
    this.undo.disabled = !canUndo
    this.redo.disabled = !canRedo
  }

  /** Delete is the one action with no meaning until something is selected. */
  setSelection(hasSelection: boolean): void {
    this.remove.disabled = !hasSelection
  }

  setCameraActive(active: boolean): void {
    this.camera?.setAttribute('aria-pressed', active ? 'true' : 'false')
  }

  /** Short, plain sentence for a denied permission or a failed start. */
  setNotice(message: string): void {
    this.notice.textContent = message
  }

  /**
   * What the microphone heard, and whether it became a command.
   *
   * Without this, a misheard word is indistinguishable from a microphone that
   * is not working at all: both produce silence. Showing the transcript makes
   * the difference obvious at a glance.
   */
  setHeard(utterance: string, understood: boolean): void {
    this.heard.textContent = utterance.length === 0 ? '' : `“${utterance}”`
    this.heard.dataset['understood'] = understood ? 'yes' : 'no'
    this.heard.title = understood ? 'Understood' : 'No command matched this'
  }

  /**
   * The tier is stated plainly rather than surfaced as a capability error. A
   * browser without the built-in model is a supported configuration, not a
   * failure to report.
   */
  setTier(tier: CapabilityTier, note = ''): void {
    const copy = TIERS[tier]
    this.badge.textContent = copy.badge
    this.badge.dataset['tier'] = tier
    this.badge.title = copy.detail
    this.detail.textContent = note.length > 0 ? `${copy.detail} ${note}` : copy.detail

    // The microphone is the one control that cannot work until this resolves,
    // so it is the only one held back rather than disabling the whole toolbar.
    if (this.mic !== null) this.mic.disabled = tier === 'loading' || tier === 'manual'
  }
}
