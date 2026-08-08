// Copies the MediaPipe vision runtime out of node_modules and into the static
// output, so the app loads its inference runtime from its own origin and keeps
// working with the network disconnected. The files are reproducible from the
// lockfile, so they are generated rather than committed.
//
// Only the ES module build is copied. Inference runs in a module worker, where
// the CommonJS build MediaPipe would otherwise fall back to cannot be loaded at
// all, so shipping it would add about 23 MB that is never requested.
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RUNTIME_FILES = ['vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm']

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const target = join(root, 'public', 'models', 'wasm')

await mkdir(target, { recursive: true })
for (const name of RUNTIME_FILES) {
  await copyFile(join(source, name), join(target, name))
}

console.log(`vision runtime copied to ${target}`)
