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
  private ratio = 0

  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'sl-overlay'
    this.canvas.setAttribute('aria-hidden', 'true')
    host.append(this.canvas)
    this.context = this.canvas.getContext('2d')
  }

  /**
   * The backing store is sized in device pixels and the context is scaled once,
   * so every draw call below works in CSS pixels and matches document
   * coordinates exactly. Without this a one pixel guide is blurred across two
   * physical pixels on a retina display.
   */
  resize(width: number, height: number): void {
    const ratio = globalThis.devicePixelRatio || 1
    if (width === this.width && height === this.height && ratio === this.ratio) return
    this.width = width
    this.height = height
    this.ratio = ratio
    this.canvas.width = Math.round(width * ratio)
    this.canvas.height = Math.round(height * ratio)
    this.canvas.style.width = `${String(width)}px`
    this.canvas.style.height = `${String(height)}px`
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  clear(): void {
    this.context?.clearRect(0, 0, this.width, this.height)
  }
}
