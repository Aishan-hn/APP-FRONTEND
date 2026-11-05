import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createFuseHandler } from './server/fuse-handler.js'
import { applySecurityHeaders } from './server/security-headers.js'

export default defineConfig(({ mode }) => {
  // Load every .env variable for server-side use only. Only VITE_* variables reach
  // the browser bundle, so secrets must never use that prefix.
  const env = loadEnv(mode, process.cwd(), '')
  // Report names only, never values: this message ends up in hosted build logs.
  // VITE_VERCEL_* are Vercel's own system variables (e.g. ..._COMMIT_AUTHOR_NAME), not secrets.
  const leaked = Object.keys(env).filter(
    (key) => key.startsWith('VITE_') && !key.startsWith('VITE_VERCEL_') && /WEBHOOK|SECRET|TOKEN|KEY|AUTH/i.test(key),
  )
  if (leaked.length) {
    throw new Error(
      `Secrets must not use the VITE_ prefix; it would bundle them into the client. Remove or rename: ${leaked.join(', ')}. Use WEBHOOK_URL instead.`,
    )
  }

  const handleFuse = createFuseHandler(env)

  const fuseApi = {
    name: 'fuse-api',
    configureServer(server) {
      server.middlewares.use('/api/fuse', handleFuse)
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        applySecurityHeaders(res)
        next()
      })
      server.middlewares.use('/api/fuse', handleFuse)
    },
  }

  return {
    plugins: [react(), tailwindcss(), fuseApi],
  }
})
