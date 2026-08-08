import './ui/tokens.css'
import './ui/shell.css'
import type { HandStatus } from './adapters/hand'
import { HandAdapter } from './adapters/hand'
import { HoverDamper } from './adapters/hover'
import { KeyboardAdapter } from './adapters/keyboard'
import { PointerAdapter } from './adapters/pointer'
import { VoiceAdapter } from './adapters/voice'
import { IntentBus } from './core/bus'
import { insertCommand, starterDocument } from './core/document'
import { loadDocument, saveDocument } from './core/persistence'
import { Store } from './core/store'
import { GifLibrary } from './media/gifs'
import { exportHtml } from './render/export'
import { Overlay, computeGuides } from './render/overlay'
import type { HandleName } from './render/renderer'
import { Renderer } from './render/renderer'
import HandWorker from './vision/hand.worker?worker'
import { HistoryLog } from './core/history-log'
import { HistoryPanel, describeCommand } from './ui/history'
import { Inspector } from './ui/inspector'
import { Toolbar } from './ui/toolbar'
import { CommandParser } from './language/parser'
import { SpeechInput, isSpeechSupported } from './language/speech'

/** Plain sentences rather than raw permission errors. */
const CAMERA_NOTICE: Record<HandStatus, string> = {
  off: '',
  starting: 'Starting the camera.',
  running: '',
  denied: 'Camera access was declined. Hand tracking stays off until it is allowed.',
  failed: 'The camera could not be started on this device.',
}

/** Hands the serialised page to the browser as a file, with no server round trip. */
function download(html: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function isCameraSupported(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function'
}

interface Shell {
  readonly toolbar: HTMLElement
  readonly stage: HTMLElement
  readonly canvasHost: HTMLElement
  readonly inspector: HTMLElement
  readonly history: HTMLElement
  readonly status: HTMLElement
}

function buildShell(host: HTMLElement): Shell {
  host.className = 'sl-app'
  host.innerHTML = `
    <header class="sl-toolbar" role="toolbar" aria-label="Editor controls">
      <h1 class="sl-toolbar__brand">Sleight</h1>
      <span class="sl-toolbar__spacer"></span>
    </header>
    <main class="sl-stage" aria-label="Canvas">
      <div class="sl-stage__inner"></div>
    </main>
    <aside class="sl-inspector" aria-label="Properties"></aside>
    <section class="sl-history" aria-label="History"></section>
    <footer class="sl-status" aria-live="polite"></footer>
  `
  const toolbar = host.querySelector<HTMLElement>('.sl-toolbar')
  const stage = host.querySelector<HTMLElement>('.sl-stage')
  const canvasHost = host.querySelector<HTMLElement>('.sl-stage__inner')
  const inspector = host.querySelector<HTMLElement>('.sl-inspector')
  const history = host.querySelector<HTMLElement>('.sl-history')
  const status = host.querySelector<HTMLElement>('.sl-status')
  if (!toolbar || !stage || !canvasHost || !inspector || !history || !status) {
    throw new Error('Editor shell failed to mount')
  }
  return { toolbar, stage, canvasHost, inspector, history, status }
}

async function start(host: HTMLElement): Promise<void> {
  const shell = buildShell(host)
  const store = new Store(loadDocument() ?? starterDocument())
  const bus = new IntentBus()
  const renderer = new Renderer(shell.canvasHost)
  const overlay = new Overlay(shell.canvasHost)

  const log = new HistoryLog({
    describe: cmd => describeCommand(cmd, store.getState().doc),
  })
  const history = new HistoryPanel({
    host: shell.history,
    onClear: () => {
      log.clear()
    },
    // The bus stamps intents with `Date.now`, so the panel has to measure
    // against the same clock or every row reads as decades of elapsed time.
    origin: Date.now(),
  })
  log.subscribe(entries => {
    history.render(entries)
  })
  history.render(log.all)

  bus.subscribe(intent => {
    // Recorded before the store applies it, so a deletion can still name the
    // block it is about to remove.
    log.record(intent)
    store.apply(intent.cmd, intent.txn, intent.ts)
  })
  let pointerX = -1
  let pointerY = -1
  shell.stage.addEventListener('pointermove', event => {
    pointerX = event.clientX
    pointerY = event.clientY
  })
  shell.stage.addEventListener('pointerleave', () => {
    pointerX = -1
    pointerY = -1
  })

  let hovered: string | null = null
  let handle: HandleName | null = null
  const damper = new HoverDamper()

  const hand = new HandAdapter({
    bus,
    worker: new HandWorker(),
    surface: shell.canvasHost,
    wasmPath: `${import.meta.env.BASE_URL}models/wasm`,
    modelPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`,
    getHovered: () => hovered,
    getHandle: () => handle,
    getSelected: () => store.getState().selectedId,
    getBox: id => {
      const block = store.getState().doc.blocks[id]
      return block === undefined ? null : block.props
    },
    onStatus: status => {
      toolbar.setCameraActive(hand.running)
      toolbar.setNotice(CAMERA_NOTICE[status])
      host.classList.toggle('is-camera-live', status === 'running')
    },
  })

  /**
   * One hit test per frame, against whichever source is in charge. The hand wins
   * while its cursor is visible so that a hand reaching across the canvas is not
   * fighting a mouse resting somewhere else.
   */
  const draw = (): void => {
    const now = performance.now()
    const state = store.getState()
    const root = state.doc.blocks[state.doc.rootId]
    if (root) overlay.resize(root.props.w, root.props.h)

    const cursor = hand.cursor
    const source = cursor !== null ? 'hand' : 'pointer'
    const x = cursor?.x ?? pointerX
    const y = cursor?.y ?? pointerY
    const probe = x < 0 ? { blockId: null, handle: null } : renderer.probe(x, y)
    handle = probe.handle
    hovered = damper.resolve({ id: probe.blockId, x, y, source, now })
    if (hovered !== state.hoveredId) bus.emit({ op: 'hover', id: hovered }, source)

    overlay.clear()
    overlay.drawGuides(computeGuides(state.doc, bus.lockedBlock('geom')))
    const cursors = hand.cursors
    if (cursors.length > 0) {
      const rect = shell.canvasHost.getBoundingClientRect()
      const local = cursors.map(c => ({ ...c, x: c.x - rect.left, y: c.y - rect.top }))
      const first = local[0]
      const second = local[1]
      if (hand.transforming && first !== undefined && second !== undefined) {
        overlay.drawTether(first.x, first.y, second.x, second.y)
      }
      for (const point of local) {
        overlay.drawDwell(point.x, point.y, point.dwell)
        overlay.drawCursor(point.x, point.y, point.pinching, now)
      }
    }
    requestAnimationFrame(draw)
  }

  const inspector = new Inspector({
    host: shell.inspector,
    onCommand: cmd => {
      bus.emit(cmd, 'pointer')
    },
    onGifRequest: request => {
      void parser.fulfilGif(request).then(cmd => {
        if (cmd.op !== 'noop') bus.emit(cmd, 'pointer')
      })
    },
  })

  let saved = store.getState().doc
  store.subscribe(state => {
    renderer.render(state)
    inspector.render(state)
    // Referential equality means a hover or selection change costs no write.
    if (state.doc !== saved) {
      saved = state.doc
      saveDocument(state.doc)
    }
  })
  renderer.render(store.getState())
  inspector.render(store.getState())
  requestAnimationFrame(draw)

  // The feed is already running for inference; mounting it behind the canvas
  // makes the page look like it is floating in the room in front of you.
  hand.feed.className = 'sl-camera'
  hand.feed.setAttribute('aria-hidden', 'true')
  shell.stage.prepend(hand.feed)

  new PointerAdapter({ surface: shell.stage, bus }).attach()
  new KeyboardAdapter({ bus, getSelected: () => store.getState().selectedId }).attach()

  const gifs = new GifLibrary({ key: import.meta.env.VITE_GIPHY_KEY })

  const parser = await CommandParser.create({
    getContext: () => {
      const state = store.getState()
      return { doc: state.doc, selectedId: state.selectedId }
    },
    getLockedKeys: () => bus.lockedKeys(),
    gifs,
    onNotice: message => {
      toolbar.setNotice(message)
    },
  })

  const voice = new VoiceAdapter({
    bus,
    parse: utterance => parser.parse(utterance),
    onResult: (utterance, cmd) => {
      toolbar.setHeard(utterance, cmd.op !== 'noop')
      // An utterance that matched nothing never reaches the bus, so the log has
      // to be told about it here or the most diagnostic line would be missing.
      if (cmd.op === 'noop') log.recordUnheard(utterance, Date.now())
    },
  })

  const speech = new SpeechInput({
    onUtterance: utterance => {
      void voice.handle(utterance)
    },
  })

  const toolbar = new Toolbar({
    host: shell.toolbar,
    statusHost: shell.status,
    speechSupported: isSpeechSupported(),
    cameraSupported: isCameraSupported(),
    onMicToggle: active => {
      if (active) speech.start()
      else speech.stop()
      toolbar.setMicActive(speech.listening)
    },
    onCameraToggle: active => {
      if (active) void hand.start()
      else hand.stop()
      toolbar.setCameraActive(hand.running)
    },
    onInsert: type => {
      const cmd = insertCommand(store.getState().doc, type)
      bus.emit(cmd, 'pointer')
      // Selecting the new block is what makes the inspector useful immediately,
      // and it is what the voice grammar's `it` will refer to next.
      bus.emit({ op: 'select', id: cmd.block.id }, 'pointer')
    },
    onDelete: () => {
      const id = store.getState().selectedId
      if (id !== null) bus.emit({ op: 'remove', id }, 'pointer')
    },
    onUndo: () => {
      bus.emit({ op: 'undo' }, 'pointer')
    },
    onRedo: () => {
      bus.emit({ op: 'redo' }, 'pointer')
    },
    onExport: () => {
      download(exportHtml(store.getState().doc), 'sleight-page.html')
    },
  })
  toolbar.setTier(parser.tier)
  toolbar.setHistory(store.getState().canUndo, store.getState().canRedo)
  toolbar.setSelection(store.getState().selectedId !== null)
  store.subscribe(state => {
    toolbar.setHistory(state.canUndo, state.canRedo)
    toolbar.setSelection(state.selectedId !== null)
  })
}

const mount = document.querySelector<HTMLDivElement>('#app')
if (mount) void start(mount)
