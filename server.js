// Production server: serves the built SPA from dist/, the /api/fuse proxy and the
// /api/stripe-webhook endpoint.
// Run with `npm start` after `npm run build`.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFuseHandler } from './server/fuse-handler.js'
import { createStripeWebhookHandler } from './server/stripe-webhook-handler.js'
import { applySecurityHeaders } from './server/security-headers.js'

const DIST_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '127.0.0.1'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const handleFuse = createFuseHandler(process.env)
const handleStripeWebhook = createStripeWebhookHandler(process.env)

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    return res.end()
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch {
    res.writeHead(400)
    return res.end()
  }

  // Resolve inside dist/ only; anything escaping it falls back to index.html
  let filePath = path.join(DIST_DIR, pathname)
  if (!filePath.startsWith(DIST_DIR + path.sep)) filePath = path.join(DIST_DIR, 'index.html')

  let data
  try {
    data = await readFile(filePath)
  } catch {
    filePath = path.join(DIST_DIR, 'index.html')
    data = await readFile(filePath)
  }

  const isHashedAsset = filePath.startsWith(path.join(DIST_DIR, 'assets') + path.sep)
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  res.end(req.method === 'HEAD' ? undefined : data)
}

const server = http.createServer((req, res) => {
  applySecurityHeaders(res)
  const { pathname } = new URL(req.url, 'http://localhost')
  if (pathname === '/api/fuse') return handleFuse(req, res)
  if (pathname === '/api/stripe-webhook') return handleStripeWebhook(req, res)
  serveStatic(req, res).catch((err) => {
    console.error('[static]', err)
    res.writeHead(500)
    res.end()
  })
})

server.requestTimeout = 150_000

server.listen(PORT, HOST, () => {
  if (!process.env.WEBHOOK_URL) console.warn('Warning: WEBHOOK_URL is not set; /api/fuse will fail.')
  console.log(`Image Fusion running at http://${HOST}:${PORT}`)
})
