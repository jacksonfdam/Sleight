import './overlay.css'

/**
 * Ephemeral per-frame graphics: the hand cursor, the dwell ring, and snap
 * guides. Everything here is cleared and repainted each frame and lives on a
 * separate surface from the document, so the export needs no cleanup pass.
 */
export class Overlay {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D | null
  private width = 0
  private height = 0

  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'sl-overlay'
    this.canvas.setAttribute('aria-hidden', 'true')
    host.append(this.canvas)
    this.context = this.canvas.getContext('2d')
  }

  /** Matches the overlay to the document canvas in CSS pixels. */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
    this.canvas.width = width
    this.canvas.height = height
    this.canvas.style.width = `${String(width)}px`
    this.canvas.style.height = `${String(height)}px`
  }

  clear(): void {
    this.context?.clearRect(0, 0, this.width, this.height)
  }
}
