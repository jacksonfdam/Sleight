import './ui/tokens.css'
import './ui/shell.css'
import { PointerAdapter } from './adapters/pointer'
import { VoiceAdapter } from './adapters/voice'
import { IntentBus } from './core/bus'
import { starterDocument } from './core/document'
import { Store } from './core/store'
import { Overlay, computeGuides } from './render/overlay'
import { Renderer } from './render/renderer'
import { Toolbar } from './ui/toolbar'
import { CommandParser } from './language/parser'
import { SpeechInput, isSpeechSupported } from './language/speech'

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

  const draw = (): void => {
    const state = store.getState()
    const root = state.doc.blocks[state.doc.rootId]
    if (root) overlay.resize(root.props.w, root.props.h)

    hovered = pointerX < 0 ? null : renderer.hitTest(pointerX, pointerY)
    if (hovered !== state.hoveredId) bus.emit({ op: 'hover', id: hovered }, 'pointer')

    overlay.clear()
    overlay.drawGuides(computeGuides(state.doc, bus.lockedBlock('geom')))
    requestAnimationFrame(draw)
  }

  store.subscribe(state => {
    renderer.render(state)
  })
  renderer.render(store.getState())
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
    onMicToggle: active => {
      if (active) speech.start()
      else speech.stop()
      toolbar.setMicActive(speech.listening)
    },
  })
  toolbar.setTier(parser.tier)
}

const mount = document.querySelector<HTMLDivElement>('#app')
if (mount) void start(mount)
