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
  readonly onMicToggle: (active: boolean) => void
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
  private readonly badge: HTMLElement
  private readonly detail: HTMLElement

  constructor(options: ToolbarOptions) {
    const spacer = options.host.querySelector('.sl-toolbar__spacer')

    this.badge = document.createElement('span')
    this.badge.className = 'sl-badge'
    options.host.append(this.badge)

    this.detail = document.createElement('span')
    options.statusHost.append(this.detail)

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
