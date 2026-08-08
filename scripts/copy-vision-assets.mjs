// Copies the MediaPipe vision runtime out of node_modules and into the static
// output, so the app loads its inference runtime from its own origin and keeps
// working with the network disconnected. The files are reproducible from the
// lockfile, so they are generated rather than committed.
import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const target = join(root, 'public', 'models', 'wasm')

await mkdir(target, { recursive: true })
await cp(source, target, { recursive: true })

console.log(`vision runtime copied to ${target}`)
