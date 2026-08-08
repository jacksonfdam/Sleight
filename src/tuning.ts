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
