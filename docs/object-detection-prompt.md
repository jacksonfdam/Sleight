# Build prompt: on-device object detection with dimension estimation

Copy everything below the line into a fresh session, in the repository where the
glasses camera project lives. Fill in the four bracketed answers at the top
first — they are the only things this document cannot decide for you.

---

Build a library that takes frames from a head-mounted camera, identifies the
objects in them, estimates each object's real-world size, and reports both. It
is a library first and a demo second: the detection surface must be usable from
another application without dragging a renderer along with it.

## Before you write code, tell me your answers to these

1. **Runtime.** Web (browser/WebXR), Android, or native? This decides the whole
   inference stack and I have assumed nothing.
2. **Frame source.** A `MediaStream`, an Android `ImageProxy`, raw buffers from
   an SDK, or files on disk for testing?
3. **Depth.** Does the device expose depth, stereo, or camera intrinsics
   (focal length, sensor size)? Answer honestly — "no" is common and changes the
   dimension feature from measurement to estimation, which I want stated rather
   than hidden.
4. **Object set.** Any object a general model knows, or a fixed list you care
   about? A fixed list is both faster and far more accurate.

Stop after asking. Do not start building until I have answered.

## Non-negotiable constraints

1. **English only.** Code, comments, identifiers, commit messages, README,
   error strings. No exceptions.
2. **Never reference the authoring process.** No mention of AI, assistants, or
   code generation anywhere in the repository, including commit trailers.
3. **Micro-commits.** One logical change per commit. Every commit must build and
   pass typecheck.
4. **Conventional Commits.** `type(scope): subject`, imperative, lowercase, no
   trailing period, under 72 characters.
5. **Strict typing.** `strict: true`, `noUncheckedIndexedAccess: true`. No
   `any`, no `@ts-ignore`. Narrow from `unknown`.
6. **Inference off the main thread.** A worker, a coroutine, a background
   thread — whatever the runtime calls it. A dropped camera frame is acceptable;
   a frozen interface is not.
7. **The library never draws.** It emits results. Rendering is a separate module
   that consumes them, so the detector can be tested without a screen.
8. **No silent failure.** Every path that can produce nothing reports why:
   model not loaded, no detections, confidence below floor, depth unavailable.
   A blank overlay must never be the only symptom.

## What to build

### The detection core

One module owning model load and inference, exposing:

```
detect(frame, timestamp) -> Detection[]

Detection {
  id          stable across frames for the same physical object
  label       what it is
  confidence  0..1
  box         normalised to the frame, not pixels
  size        { width, height, depth?, unit, method } | null
}
```

Normalised boxes, not pixels: the consumer knows its own viewport and the
detector does not. Every consumer that has to divide by a resolution it was
told separately is a bug waiting for the first camera that changes resolution.

**Model choice is yours to argue for**, not mine to dictate. Present two
candidates with the trade-off stated — accuracy, size on disk, latency per
frame, and licence — and pick one. If the runtime is web, MediaPipe Tasks and
transformers.js are both reasonable starting points and they are not equivalent.

### Tracking across frames

Raw per-frame detection flickers: labels swap, boxes jitter, objects vanish for
a frame and return. Three things are required and each needs a tuning constant
with a comment saying what breaks in either direction:

- **Identity.** Match detections between frames by box overlap so an object
  keeps one id. Without it, no measurement can be averaged and every label
  redraws from scratch.
- **Smoothing.** Filter box corners over time. Use a filter whose cutoff varies
  with speed (a One Euro filter is the obvious choice) rather than a fixed
  average: a fixed average that is calm enough to stop jitter is too slow to
  follow a head turn, and head turns are the normal case here.
- **Hysteresis.** Separate thresholds to acquire and to drop a track. A single
  threshold makes objects at the boundary blink on and off.

### Dimension estimation

This is where the project is most likely to quietly lie, so it gets the most
scrutiny.

Implement whichever of these the hardware supports, in this order:

1. **Depth or stereo available.** Real measurement. Report `method: 'depth'`.
2. **Camera intrinsics available, object on a known plane.** Estimate from focal
   length and the ground assumption. Report `method: 'projected'`.
3. **Neither.** Estimate from a table of typical sizes for known object classes,
   scaled by box size. Report `method: 'inferred'` — and make it visually
   distinct in any UI, because it is a guess dressed as a number.

**Every size carries the method that produced it, and the confidence of that
method.** Never report a centimetre figure without the reader being able to tell
which of the three produced it. If you find yourself wanting to drop `method` to
simplify a signature, that is the signature telling you the number is being
laundered.

Include a calibration path: point at an object of known size, and the estimator
records the correction factor.

## Testing

- The tracker, the filter, the matcher, and the size estimator are pure
  functions over data. Test them with synthetic detection sequences — no camera,
  no model, no device.
- Include a fixture of recorded frames with hand-checked expected labels, and a
  test that fails when accuracy drops below a stated floor.
- Do not write a test that starts a camera. It cannot run anywhere useful.

## The demo

A thin application over the library: camera feed, a box per detection, a label,
and the size with its method. Nothing in it may be needed by the library.

## Documentation

A README covering: what it detects and what it does not, measured latency per
frame on real hardware with the device named, the accuracy floor the tests
enforce, how each of the three estimation methods works and how far you can
trust each, the calibration procedure, and a Known limitations section.

Under Known limitations, state plainly: which objects it misses, how it behaves
in low light, what happens when the wearer turns quickly, and how wrong an
`inferred` measurement can be. If you learn a number for that last one, print
the number.

## How to work

- Ask the four questions. Wait for answers.
- Then propose the module boundaries and the model choice, with trade-offs. Wait
  for agreement before building.
- Then build in micro-commits.
- Verify on real hardware and report what you actually ran. If you could not
  test something — and the camera path is the likely one — say so plainly rather
  than implying coverage you do not have.
- Every tuning constant gets a comment explaining what goes wrong if it moves in
  either direction. A number with no rationale is a number nobody can safely
  change later.
