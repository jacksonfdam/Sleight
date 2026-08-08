import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

const RUNTIME_PREFIX = '/models/wasm/'

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
}

/**
 * Serves the vision runtime verbatim during development.
 *
 * The runtime is loaded at run time by MediaPipe, not imported by our own code.
 * The dev server would otherwise treat that request as a source module, append
 * its `?import` marker, and fail — files under `public/` are copied as-is and
 * never enter the module graph. Production never reaches this code path, because
 * there is no dev server to intercept the request.
 */
function serveVisionRuntime(): Plugin {
  return {
    name: 'sleight:serve-vision-runtime',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? ''
        if (!path.startsWith(RUNTIME_PREFIX)) {
          next()
          return
        }

        const file = join(server.config.publicDir, normalize(path).replace(/^(\.\.[/\\])+/, ''))
        readFile(file)
          .then(body => {
            res.setHeader('Content-Type', MIME[extname(path)] ?? 'application/octet-stream')
            res.end(body)
          })
          .catch(() => {
            next()
          })
      })
    },
  }
}

export default defineConfig({
  plugins: [serveVisionRuntime()],
  build: {
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
})
