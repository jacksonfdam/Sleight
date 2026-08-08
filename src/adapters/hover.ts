import type { IntentSource } from '../core/types'
import { HOVER_DWELL_MS, HOVER_RELEASE_PX } from '../tuning'

export interface HoverProbe {
  readonly id: string | null
  /** Client coordinates of the point that produced the hit. */
  readonly x: number
  readonly y: number
  readonly source: IntentSource
  readonly now: number
}

/**
 * Decides when a hit test result becomes the committed hover. A mouse commits
 * immediately; a hand has to hold a block for a moment, and has to leave the
 * committed block by a margin before it is released. Gating on the source is the
 * whole point: applying the hand's debounce to a mouse makes the mouse feel
 * broken, and applying the mouse's immediacy to a hand makes the highlight
 * flicker across every block on the way to the target.
 */
export class HoverDamper {
  private committed: string | null = null
  private candidate: string | null = null
  private candidateSince = 0
  private lastX = 0
  private lastY = 0

  resolve(probe: HoverProbe): string | null {
    if (probe.source !== 'hand') {
      this.committed = probe.id
      this.candidate = probe.id
      this.lastX = probe.x
      this.lastY = probe.y
      return this.committed
    }

    if (probe.id === this.committed) {
      this.candidate = probe.id
      this.lastX = probe.x
      this.lastY = probe.y
      return this.committed
    }

    // Leaving the committed block only counts once the point has travelled far
    // enough that it cannot be filter overshoot.
    if (
      this.committed !== null &&
      Math.hypot(probe.x - this.lastX, probe.y - this.lastY) < HOVER_RELEASE_PX
    ) {
      return this.committed
    }

    if (probe.id !== this.candidate) {
      this.candidate = probe.id
      this.candidateSince = probe.now
      return this.committed
    }

    if (probe.now - this.candidateSince < HOVER_DWELL_MS) return this.committed

    this.committed = probe.id
    this.lastX = probe.x
    this.lastY = probe.y
    return this.committed
  }

  reset(): void {
    this.committed = null
    this.candidate = null
  }
}
