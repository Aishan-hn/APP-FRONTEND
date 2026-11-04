import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createFuseHandler } from './server/fuse-handler.js'
import { applySecurityHeaders } from './server/security-headers.js'

export default defineConfig(({ mode }) => {
  // Load every .env variable for server-side use only. Only VITE_* variables reach
  // the browser bundle, so secrets must never use that prefix.
  const env = loadEnv(mode, process.cwd(), '')
  if (Object.keys(env).some((key) => key.startsWith('VITE_') && /WEBHOOK|SECRET|TOKEN|KEY|AUTH/i.test(key))) {
    throw new Error('Secrets must not use the VITE_ prefix; it would bundle them into the client. Use WEBHOOK_URL instead.')
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
