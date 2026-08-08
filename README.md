# Sleight

Sleight is a block layout editor with three interchangeable input sources. The
same document can be edited with a mouse, with a hand tracked through the
webcam, or by speaking, and all three can be used at the same moment without
waiting on each other. It exports a standalone HTML page.

## Live demo

Not yet deployed. See [Deploying](#deploying) — the build is production ready and
the URL goes here once the project is imported.

## Browser requirements

Sleight is usable in any modern browser with a mouse. The other two input
sources have real requirements, and the application degrades in tiers rather
than failing.

Hand tracking needs a webcam and a Chromium-based browser, and a secure context
(`localhost` or `https`). It is never started automatically: the camera opens
only when the Camera control is switched on, and the control is hidden entirely
where `getUserMedia` is unavailable.

Natural-language voice commands need the browser's built-in `LanguageModel`,
which is available in Chrome 148 and later on desktop and requires an official
Google Chrome build. Chromium packages from Linux distributions ship without the
inference component and report `unavailable` regardless of hardware. Edge,
Firefox, and Safari do not support it at all.

The active tier is detected at runtime and stated in the toolbar and the status
bar. There is no capability error to interpret.

| Tier    | Requirement                      | Voice behaviour                                                  |
| ------- | -------------------------------- | ---------------------------------------------------------------- |
| Full    | `LanguageModel` available        | Natural-language commands, with the grammar as a fallback        |
| Grammar | Speech recognition, but no model | The documented grammar handles a fixed set of phrasings          |
| Manual  | No speech recognition            | Voice controls are hidden; mouse and hand editing are unaffected |

Every tier works with the network disconnected after first load. Speech
recognition itself may use a network service depending on the browser; nothing
in Sleight does.

## Architecture

```
src/
  core/        block tree, reducer, store, intent bus, property locks
  adapters/    pointer, hand, and voice input translated into intents
  vision/      hand landmark inference in a worker, one euro filtering
  language/    speech capture, deterministic grammar, on-device model parsing
  render/      dom renderer, overlay canvas, standalone html export
  ui/          toolbar, inspector, design tokens
```

Dependencies point strictly inward. `adapters/`, `render/`, `language/`, and
`ui/` all depend on `core/`; `core/` depends on nothing. An import running the
other way is an architecture violation, not a shortcut.

### One intent, three sources

The single decision the rest of the codebase rests on is that no input source
talks to the document. Each one produces the same value and hands it to a bus:

```ts
type Intent = {
  cmd: Command
  source: 'pointer' | 'hand' | 'voice'
  txn?: string // groups a continuous gesture into one undo step
  ts: number
}
```

A mouse drag, a pinch, and the sentence "make it wider" all arrive as a
`nudge` command on the same path. Nothing downstream can tell them apart, so
hover highlighting, selection, undo grouping, and the renderer are written once
and behave identically in every mode. Adding a fourth source would mean writing
one adapter and changing nothing else.

`PropPath` is a closed union — `'x' | 'y' | 'w' | 'h' | 'color' | 'fontSize' |
'align' | 'src' | 'text'` — and `set` is distributed over it, so a command that
pairs the wrong value with a path does not compile.

### The property lock table

Two sources editing at once is the interesting case, and resolving it globally
would be wrong: a single editor-wide lock would mean a resize gesture blocks
every spoken command until the hand opens. Sleight resolves contention per
property group instead.

| Group     | Paths                        |
| --------- | ---------------------------- |
| `geom`    | `x`, `y`, `w`, `h`           |
| `style`   | `color`, `fontSize`, `align` |
| `content` | `src`, `text`                |

The rules are:

- A continuous gesture leases `${blockId}:${group}` for the length of its
  transaction, renewed by every intent it emits.
- An intent from a different transaction targeting a leased key is deferred if
  it came from voice, and dropped otherwise. Voice waits because an utterance is
  expensive to produce and nobody wants to repeat it; a pointer or hand sample is
  dropped because another one arrives a frame later.
- The deferred queue drains in FIFO order the moment the lease is released.
- Leases expire after 1500ms. A gesture that stops emitting — camera occlusion,
  a dropped pointer capture, a closed lid — must not be able to deadlock the
  document, so an expiry timer frees the key and drains the queue without it.

This is what makes the defining scenario work. Resizing the hero holds
`hero:geom`; saying "change the text color to teal" mid-gesture takes
`hero:style`. Different keys, no contention, both land. Say "set the width to
900" during the same gesture and it targets `hero:geom` instead, so it waits and
applies the instant the pinch opens.

The lock table also pays for itself in the undo stack. History is stored as a
list of transactions rather than document snapshots, and undo drops the last
transaction and replays the rest. That is only correct if concurrent
transactions commute — which the lock table guarantees, because it never lets two
of them touch the same property group.

### Undo groups by transaction

One pinch-drag emitting forty `nudge` commands is one undo step, because all
forty carry the same `txn`. A voice command issued during that drag carries no
`txn` of its own and becomes a separate step, ordered by its own timestamp, so
undoing it leaves the drag intact.

## Why DOM for the document and canvas for the overlay

The document renders to DOM. The output of this editor is an HTML page, so the
editing surface and the export should be the same primitive — text layout,
`contenteditable`, and accessibility all come free, and export is serialisation
rather than translation. There is no framework: the renderer writes to the DOM
directly and reads live layout through `elementFromPoint`, and a virtual DOM
would both fight that and add reconciliation to the per-frame path.

The overlay renders to a Canvas 2D surface sitting above the document with
`pointer-events: none`. The hand cursor, the dwell ring, and the snap guides are
per-frame graphics that must never appear in the export, and keeping them on a
separate surface means the export needs no cleanup pass at all — there is
nothing to strip, because those pixels were never part of the document.

Selection and hover outlines are `::after` pseudo-elements on the block itself,
so their geometry follows layout with no measurement, and the highlight is
identical whether a mouse or a hand produced it.

Two rules keep the per-frame path cheap:

- Hit testing runs exactly once per frame inside the rAF loop, never per event.
  `elementFromPoint` forces a style flush, and calling it on every pointer move
  costs frames during a drag for a result that cannot change more than once a
  frame anyway.
- Hover damping is applied to the hand only. A smoothed hand point grazes blocks
  it is merely passing over, so a candidate must be held for 120ms before it is
  committed and the point must clear the current block by 8px before it is
  released. The mouse is deliberately exempt: the same debounce makes a mouse
  feel broken.

## Hand tracking

Landmark inference runs in a worker, using MediaPipe's HandLandmarker compiled
to WebAssembly. The main thread receives only `{ x, y, pinch, confidence }`;
landmarks never cross the boundary. Inference on the main thread would contend
with layout during exactly the drags it is meant to drive.

The tracked point is the midpoint of thumb tip and index tip, so closing the
pinch does not drag the cursor off the thing being grabbed. It is smoothed with a
One Euro filter rather than a moving average or a lerp: a fixed smoother forces
one choice for the whole gesture, steady enough to hold still or responsive
enough to move fast, never both. One Euro varies its cutoff with observed speed
and gives both.

Pinch detection uses hysteresis — close at a normalised distance of 0.045, open
at 0.065. A single threshold sits exactly where the signal is noisiest and
produces phantom releases in the middle of a drag. A dwell click is available as
an accessibility fallback: hold the cursor inside a 20px circle for 600ms, with a
progress ring giving continuous feedback. Below 0.6 tracking confidence the
cursor is hidden rather than drawn, because a cursor that wanders on its own is
worse than no cursor.

Every value tuned by feel lives in `src/tuning.ts`, each with a comment saying
what goes wrong when it moves in either direction.

## Running locally

```
npm install
npm run dev
```

The camera requires a secure context, so hand tracking works on `localhost` and
over `https`, but not over plain `http` to another host.

Other scripts:

```
npm run build      # production build into dist/
npm run typecheck  # tsc --noEmit
npm test           # unit tests
npm run lint       # eslint
```

`npm install` and `npm run build` copy the MediaPipe vision runtime out of
`node_modules` into `public/models/wasm`, so the app loads its inference runtime
from its own origin.

## Deploying

Import the repository on Vercel. The included `vercel.json` sets the build
command to `npm run build` and the output directory to `dist`, and marks
everything under `/models/` as immutable for a year. No environment variables
and no secrets are required, because all inference is on device.

## Known limitations

- Documents persist to `localStorage` only. There is no account, no sync, and no
  server; clearing site data clears the page. This is deliberate for a proof of
  concept and is the first thing that would change.
- Four block types: `section`, `hero`, `text`, and `image`. There is no way to
  add a block from the interface; the starter document is the starting point.
- No collaborative editing. The lock table resolves contention between input
  sources on one machine, not between people.
- No responsive breakpoints. The canvas is a single fixed-size surface and the
  export is absolutely positioned at that size.
- Hand tracking degrades in low light and near the frame edges. The usable middle
  70% of the camera frame is stretched across the canvas for that reason, which
  trades precision for reach.
- The on-device model is small. It is used only to classify an utterance into a
  fixed command vocabulary, which is well within it. It is not asked to reason
  about layout or aesthetics, and it should not be.
- The vendored vision assets are large: about 42 MB in `dist`, of which 7.5 MB is
  the hand landmarker model and the rest is the WebAssembly runtime. The
  application code itself is 15 kB gzipped, plus 45 kB gzipped for the worker.
  Nothing under `/models/` is fetched until the camera is switched on.

## License

MIT
