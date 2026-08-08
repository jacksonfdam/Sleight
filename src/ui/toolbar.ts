import './toolbar.css'
import type { CapabilityTier } from '../language/parser'

const TIERS: Record<CapabilityTier, { readonly badge: string; readonly detail: string }> = {
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
  readonly onUndo: () => void
  readonly onRedo: () => void
  readonly onExport: () => void
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

  setCameraActive(active: boolean): void {
    this.camera?.setAttribute('aria-pressed', active ? 'true' : 'false')
  }

  /** Short, plain sentence for a denied permission or a failed start. */
  setNotice(message: string): void {
    this.notice.textContent = message
  }

  /**
   * The tier is stated plainly rather than surfaced as a capability error. A
   * browser without the built-in model is a supported configuration, not a
   * failure to report.
   */
  setTier(tier: CapabilityTier): void {
    const copy = TIERS[tier]
    this.badge.textContent = copy.badge
    this.badge.dataset['tier'] = tier
    this.badge.title = copy.detail
    this.detail.textContent = copy.detail
  }
}
