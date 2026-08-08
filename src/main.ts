import './ui/tokens.css'
import './ui/shell.css'
import { starterDocument } from './core/document'
import { Store } from './core/store'
import { Renderer } from './render/renderer'

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
  const renderer = new Renderer(shell.canvasHost)

  store.subscribe(state => {
    renderer.render(state)
  })
  renderer.render(store.getState())
}

const mount = document.querySelector<HTMLDivElement>('#app')
if (mount) start(mount)
