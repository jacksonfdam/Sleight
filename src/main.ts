import './ui/tokens.css'
import './ui/shell.css'
import type { HandStatus } from './adapters/hand'
import { HandAdapter } from './adapters/hand'
import { HoverDamper } from './adapters/hover'
import { PointerAdapter } from './adapters/pointer'
import { VoiceAdapter } from './adapters/voice'
import { IntentBus } from './core/bus'
import { starterDocument } from './core/document'
import { Store } from './core/store'
import { exportHtml } from './render/export'
import { Overlay, computeGuides } from './render/overlay'
import { Renderer } from './render/renderer'
import HandWorker from './vision/hand.worker?worker'
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
    <footer class="sl-status" aria-live="polite"></footer>
  `
  const toolbar = host.querySelector<HTMLElement>('.sl-toolbar')
  const stage = host.querySelector<HTMLElement>('.sl-stage')
  const canvasHost = host.querySelector<HTMLElement>('.sl-stage__inner')
  const inspector = host.querySelector<HTMLElement>('.sl-inspector')
  const status = host.querySelector<HTMLElement>('.sl-status')
  if (!toolbar || !stage || !canvasHost || !inspector || !status) {
    throw new Error('Editor shell failed to mount')
  }
  return { toolbar, stage, canvasHost, inspector, status }
}

async function start(host: HTMLElement): Promise<void> {
  const shell = buildShell(host)
  const store = new Store(starterDocument())
  const bus = new IntentBus()
  const renderer = new Renderer(shell.canvasHost)
  const overlay = new Overlay(shell.canvasHost)

  bus.subscribe(intent => {
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
  const damper = new HoverDamper()

  const hand = new HandAdapter({
    bus,
    worker: new HandWorker(),
    surface: shell.canvasHost,
    wasmPath: `${import.meta.env.BASE_URL}models/wasm`,
    modelPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`,
    getHovered: () => hovered,
    onStatus: status => {
      toolbar.setCameraActive(hand.running)
      toolbar.setNotice(CAMERA_NOTICE[status])
    },
  })

  /**
   * One hit test per frame, against whichever source is in charge. The hand wins
   * while its cursor is visible so that a hand reaching across the canvas is not
   * fighting a mouse resting somewhere else.
   */
  const draw = (): void => {
    const state = store.getState()
    const root = state.doc.blocks[state.doc.rootId]
    if (root) overlay.resize(root.props.w, root.props.h)

    const cursor = hand.cursor
    const source = cursor.visible ? 'hand' : 'pointer'
    const x = cursor.visible ? cursor.x : pointerX
    const y = cursor.visible ? cursor.y : pointerY
    const hit = x < 0 ? null : renderer.hitTest(x, y)
    hovered = damper.resolve({ id: hit, x, y, source, now: performance.now() })
    if (hovered !== state.hoveredId) bus.emit({ op: 'hover', id: hovered }, source)

    overlay.clear()
    overlay.drawGuides(computeGuides(state.doc, bus.lockedBlock('geom')))
    if (cursor.visible) {
      const rect = shell.canvasHost.getBoundingClientRect()
      const x = cursor.x - rect.left
      const y = cursor.y - rect.top
      overlay.drawDwell(x, y, cursor.dwell)
      overlay.drawCursor(x, y, cursor.pinching)
    }
    requestAnimationFrame(draw)
  }

  const inspector = new Inspector({
    host: shell.inspector,
    onCommand: cmd => {
      bus.emit(cmd, 'pointer')
    },
  })

  store.subscribe(state => {
    renderer.render(state)
    inspector.render(state)
  })
  renderer.render(store.getState())
  inspector.render(store.getState())
  requestAnimationFrame(draw)

  new PointerAdapter({ surface: shell.stage, bus }).attach()

  const parser = await CommandParser.create({
    getContext: () => {
      const state = store.getState()
      return { doc: state.doc, selectedId: state.selectedId }
    },
    getLockedKeys: () => bus.lockedKeys(),
  })

  const voice = new VoiceAdapter({
    bus,
    parse: utterance => parser.parse(utterance),
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
  store.subscribe(state => {
    toolbar.setHistory(state.canUndo, state.canRedo)
  })
}

const mount = document.querySelector<HTMLDivElement>('#app')
if (mount) void start(mount)
