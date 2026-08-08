import './toolbar.css'

export interface ToolbarOptions {
  readonly host: HTMLElement
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

  constructor(options: ToolbarOptions) {
    const spacer = options.host.querySelector('.sl-toolbar__spacer')

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
}
