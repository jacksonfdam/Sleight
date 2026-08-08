import './overlay.css'
import { absoluteOrigin, subtreeIds } from '../core/document'
import type { DocumentState } from '../core/types'
import { SNAP_TOLERANCE_PX } from '../tuning'

const LABEL_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export interface Guide {
  readonly axis: 'x' | 'y'
  /** Position of the line along its axis, in document pixels. */
  readonly at: number
  /** Extent of the line along the other axis. */
  readonly from: number
  readonly to: number
  /** Gap between the two aligned boxes, for the distance label. */
  readonly gap: number
}

interface Box {
  readonly id: string
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly centerX: number
  readonly centerY: number
}

function boxFor(doc: DocumentState, id: string): Box | null {
  const block = doc.blocks[id]
  if (block === undefined) return null
  const origin = absoluteOrigin(doc, id)
  const right = origin.x + block.props.w
  const bottom = origin.y + block.props.h
  return {
    id,
    left: origin.x,
    top: origin.y,
    right,
    bottom,
    centerX: origin.x + block.props.w / 2,
    centerY: origin.y + block.props.h / 2,
  }
}

/**
 * Alignment between the dragged block and everything else on the canvas. Pure
 * geometry over the document, so it produces the same guides whether the drag
 * came from a mouse or a hand.
 */
export function computeGuides(doc: DocumentState, activeId: string | null): Guide[] {
  if (activeId === null || activeId === doc.rootId) return []
  const active = boxFor(doc, activeId)
  if (active === null) return []

  const guides: Guide[] = []
  for (const id of subtreeIds(doc, doc.rootId)) {
    if (id === activeId || id === doc.rootId) continue
    const other = boxFor(doc, id)
    if (other === null) continue

    for (const [a, b] of [
      [active.left, other.left],
      [active.left, other.right],
      [active.right, other.left],
      [active.right, other.right],
      [active.centerX, other.centerX],
    ] as const) {
      if (Math.abs(a - b) <= SNAP_TOLERANCE_PX) {
        guides.push({
          axis: 'x',
          at: b,
          from: Math.min(active.top, other.top),
          to: Math.max(active.bottom, other.bottom),
          gap: Math.max(0, Math.max(active.top, other.top) - Math.min(active.bottom, other.bottom)),
        })
      }
    }

    for (const [a, b] of [
      [active.top, other.top],
      [active.top, other.bottom],
      [active.bottom, other.top],
      [active.bottom, other.bottom],
      [active.centerY, other.centerY],
    ] as const) {
      if (Math.abs(a - b) <= SNAP_TOLERANCE_PX) {
        guides.push({
          axis: 'y',
          at: b,
          from: Math.min(active.left, other.left),
          to: Math.max(active.right, other.right),
          gap: Math.max(0, Math.max(active.left, other.left) - Math.min(active.right, other.right)),
        })
      }
    }
  }
  return guides
}

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
  private guideColor = '#d4380d'
  private labelInk = '#ffffff'
  private cursorColor = '#0f766e'
  private ringColor = 'rgb(15 118 110 / 35%)'

  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'sl-overlay'
    this.canvas.setAttribute('aria-hidden', 'true')
    host.append(this.canvas)
    this.context = this.canvas.getContext('2d')
    this.readTokens()
    globalThis.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      this.readTokens()
    })
  }

  /** Colours come from the token file so the overlay follows the colour scheme. */
  private readTokens(): void {
    const styles = getComputedStyle(this.canvas)
    this.guideColor = styles.getPropertyValue('--sl-guide').trim() || this.guideColor
    this.labelInk = styles.getPropertyValue('--sl-text-inverse').trim() || this.labelInk
    this.cursorColor = styles.getPropertyValue('--sl-cursor').trim() || this.cursorColor
    this.ringColor = styles.getPropertyValue('--sl-cursor-ring').trim() || this.ringColor
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

  /**
   * The hand cursor is drawn here rather than as a DOM element so it can move
   * every frame without touching layout, and so it can never end up in the
   * export.
   */
  drawCursor(x: number, y: number, pinching: boolean): void {
    const context = this.context
    if (context === null) return

    context.save()
    context.fillStyle = this.cursorColor
    context.strokeStyle = this.cursorColor
    context.lineWidth = 2

    context.beginPath()
    context.arc(x, y, pinching ? 6 : 10, 0, Math.PI * 2)
    if (pinching) context.fill()
    else context.stroke()

    context.beginPath()
    context.arc(x, y, 2, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }

  /** Continuous feedback for the dwell timer, drawn as a filling arc. */
  drawDwell(x: number, y: number, progress: number): void {
    const context = this.context
    if (context === null || progress <= 0) return

    context.save()
    context.lineWidth = 3
    context.lineCap = 'round'

    context.strokeStyle = this.ringColor
    context.beginPath()
    context.arc(x, y, 16, 0, Math.PI * 2)
    context.stroke()

    context.strokeStyle = this.cursorColor
    context.beginPath()
    context.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
    context.stroke()
    context.restore()
  }

  drawGuides(guides: readonly Guide[]): void {
    const context = this.context
    if (context === null || guides.length === 0) return

    context.save()
    context.strokeStyle = this.guideColor
    context.lineWidth = 1
    context.setLineDash([4, 3])
    context.beginPath()
    for (const guide of guides) {
      // The half pixel offset puts the stroke on a device pixel boundary.
      const at = Math.round(guide.at) + 0.5
      if (guide.axis === 'x') {
        context.moveTo(at, guide.from)
        context.lineTo(at, guide.to)
      } else {
        context.moveTo(guide.from, at)
        context.lineTo(guide.to, at)
      }
    }
    context.stroke()
    context.setLineDash([])
    for (const guide of guides) this.drawDistance(context, guide)
    context.restore()
  }

  /**
   * The gap between the two aligned edges, printed at the midpoint of the guide.
   * A guide alone says the edges line up; the number says how far apart they are,
   * which is what you actually need when spacing a stack of blocks.
   */
  private drawDistance(context: CanvasRenderingContext2D, guide: Guide): void {
    if (guide.gap <= 0) return
    const label = String(Math.round(guide.gap))
    context.font = `11px ${LABEL_FONT}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    const middle = (guide.from + guide.to) / 2
    const x = guide.axis === 'x' ? guide.at : middle
    const y = guide.axis === 'x' ? middle : guide.at
    const width = context.measureText(label).width + 8

    context.fillStyle = this.guideColor
    context.beginPath()
    context.roundRect(x - width / 2, y - 8, width, 16, 3)
    context.fill()

    context.fillStyle = this.labelInk
    context.fillText(label, x, y)
  }
}
