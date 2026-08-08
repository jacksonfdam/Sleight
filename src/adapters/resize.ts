import type { NumericPath } from '../core/types'
import type { HandleName } from '../render/renderer'

/** Which edges a handle drives, as multipliers on the cursor delta. */
const HANDLE_AXES: Record<HandleName, { readonly ew: -1 | 0 | 1; readonly ns: -1 | 0 | 1 }> = {
  nw: { ew: -1, ns: -1 },
  n: { ew: 0, ns: -1 },
  ne: { ew: 1, ns: -1 },
  e: { ew: 1, ns: 0 },
  se: { ew: 1, ns: 1 },
  s: { ew: 0, ns: 1 },
  sw: { ew: -1, ns: 1 },
  w: { ew: -1, ns: 0 },
}

export interface Nudge {
  readonly path: NumericPath
  readonly delta: number
}

/**
 * The nudges a handle drag produces. A west or north handle grows the block by
 * moving its origin, so it writes both an origin and a size delta. Shared by the
 * pointer and the hand so a pinch on a handle resizes exactly as a mouse does.
 */
export function resizeNudges(handle: HandleName, dx: number, dy: number): Nudge[] {
  const axes = HANDLE_AXES[handle]
  const out: Nudge[] = []

  if (axes.ew === 1) {
    out.push({ path: 'w', delta: dx })
  } else if (axes.ew === -1) {
    out.push({ path: 'x', delta: dx }, { path: 'w', delta: -dx })
  }

  if (axes.ns === 1) {
    out.push({ path: 'h', delta: dy })
  } else if (axes.ns === -1) {
    out.push({ path: 'y', delta: dy }, { path: 'h', delta: -dy })
  }

  return out.filter(nudge => nudge.delta !== 0)
}
