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
