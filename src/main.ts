import './ui/tokens.css'
import { starterDocument } from './core/document'
import { Store } from './core/store'
import { Renderer } from './render/renderer'

const host = document.querySelector<HTMLDivElement>('#app')

if (host) {
  const store = new Store(starterDocument())
  const renderer = new Renderer(host)
  store.subscribe(state => {
    renderer.render(state)
  })
  renderer.render(store.getState())
}
