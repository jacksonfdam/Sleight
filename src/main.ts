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
import { parseGrammar } from './language/grammar'
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

function start(host: HTMLElement): void {
  const shell = buildShell(host)
  const store = new Store(starterDocument())
  const bus = new IntentBus()
  const renderer = new Renderer(shell.canvasHost)
  const overlay = new Overlay(shell.canvasHost)

  bus.subscribe(intent => {
    store.apply(intent.cmd, intent.txn, intent.ts)
  })
  const draw = (): void => {
    const state = store.getState()
    const root = state.doc.blocks[state.doc.rootId]
    if (root) overlay.resize(root.props.w, root.props.h)
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

  const voice = new VoiceAdapter({
    bus,
    parse: utterance => {
      const state = store.getState()
      return Promise.resolve(
        parseGrammar(utterance, { doc: state.doc, selectedId: state.selectedId }),
      )
    },
  })

  const speech = new SpeechInput({
    onUtterance: utterance => {
      void voice.handle(utterance)
    },
  })

  const toolbar = new Toolbar({
    host: shell.toolbar,
    speechSupported: isSpeechSupported(),
    onMicToggle: active => {
      if (active) speech.start()
      else speech.stop()
      toolbar.setMicActive(speech.listening)
    },
  })
}

const mount = document.querySelector<HTMLDivElement>('#app')
if (mount) start(mount)
