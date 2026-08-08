/**
 * Every value in this file was settled by feel rather than by derivation. Each
 * comment says what goes wrong when the number moves in either direction, so a
 * later change is a decision rather than a guess.
 */

/**
 * How long a gesture may hold a property lock without emitting another intent.
 * Lower and a slow, deliberate drag releases its own lock mid-gesture, letting a
 * competing source interleave. Higher and a gesture that dies to camera
 * occlusion blocks deferred voice commands for that much longer.
 */
export const LOCK_TTL_MS = 1500

/**
 * How close two edges must be before a snap guide appears during a drag.
 * Lower and the guides stop showing up when you want them. Higher and several
 * guides fire at once, which reads as noise rather than alignment.
 */
export const SNAP_TOLERANCE_PX = 6

/**
 * Silence after an interim speech result before it is treated as a finished
 * command. Lower and half-spoken phrases get parsed. Higher and every command
 * waits on the recogniser's own end-of-speech detection, which costs several
 * hundred milliseconds of felt latency.
 */
export const VOICE_PAUSE_MS = 320

/**
 * Step applied by a spoken size command such as "make it wider". Lower and the
 * command has to be repeated to make a visible difference. Higher and a single
 * utterance overshoots past the layout the speaker had in mind.
 */
export const VOICE_SIZE_STEP_PX = 40

/** Step applied by "make the text bigger". Same trade-off at type scale. */
export const VOICE_FONT_STEP_PX = 4

/**
 * How long the built-in model gets before the grammar answers instead. Lower and
 * valid model responses are thrown away on a busy machine. Higher and a stalled
 * inference is felt as the editor ignoring what was said.
 */
export const MODEL_TIMEOUT_MS = 1200

/**
 * One Euro filter constants for the tracked hand point.
 *
 * `minCutoff` sets the smoothing applied when the hand is still: lower is
 * steadier but adds lag to slow movements. `beta` sets how quickly smoothing is
 * given up as the hand speeds up: higher tracks fast reaches closely but lets
 * jitter through, lower feels like dragging through treacle. `dCutoff` smooths
 * the speed estimate itself; raising it makes the filter react to speed changes
 * sooner at the cost of reacting to noise as though it were movement.
 */
export const ONE_EURO_MIN_CUTOFF = 1
export const ONE_EURO_BETA = 0.007
export const ONE_EURO_D_CUTOFF = 1

/**
 * Pinch thresholds, as a normalised distance between thumb tip and index tip.
 * They are deliberately different: a single threshold sits exactly where the
 * signal is noisiest and produces phantom releases in the middle of a drag.
 * Widening the gap makes the gesture more forgiving but slower to register.
 */
export const PINCH_CLOSE = 0.045
export const PINCH_OPEN = 0.065

/**
 * Below this tracking confidence the cursor is hidden rather than drawn. A
 * cursor that wanders on its own is worse than no cursor: it invites the user to
 * chase it. Raising this hides the cursor during ordinary hand rotation.
 */
export const HAND_CONFIDENCE_MIN = 0.6

/**
 * Dwell click: how long the cursor must stay inside a small circle to count as
 * a click, and how big that circle is. Shorter fires while the hand is merely
 * passing over a block; longer makes the fallback tiring to use.
 */
export const DWELL_MS = 600
export const DWELL_RADIUS_PX = 20

/**
 * Fraction of the camera frame trimmed from each edge before mapping to the
 * canvas. Hand tracking degrades near the frame edge, so the usable middle is
 * stretched to cover the whole canvas. Larger means less arm movement covers
 * more canvas, at the cost of precision.
 */
export const HAND_ACTIVE_MARGIN = 0.15

/**
 * Hover damping, applied to the hand only. A smoothed hand point grazes blocks
 * it is merely passing over, so a candidate must persist before it is committed,
 * and the point must clear the current block's edge before hover is dropped.
 * The mouse is deliberately exempt: the same debounce makes a mouse feel broken.
 */
export const HOVER_DWELL_MS = 120
export const HOVER_RELEASE_PX = 8

/**
 * Bounds on a single two-hand scale gesture, relative to the size the block had
 * when the gesture started. Tighter and a deliberate shrink stops short of what
 * was intended; looser and a moment of bad tracking can throw a block to a size
 * that has to be undone rather than corrected.
 */
export const PINCH_SCALE_MIN = 0.2
export const PINCH_SCALE_MAX = 6

/**
 * How far apart the two pinch points must be before a scale gesture engages, as
 * a fraction of the canvas width. Below this the two hands are close enough that
 * small tracking errors swing the ratio wildly, so the gesture waits.
 */
export const TWO_HAND_MIN_SPAN = 0.08

/**
 * How long the hand reticle takes to complete one turn. Faster reads as an
 * error state rather than as a live cursor; slower and the rotation stops
 * registering as motion at all.
 */
export const RETICLE_PERIOD_MS = 2600
