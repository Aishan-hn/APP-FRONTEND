// Server-side proxy for the image fusion webhook. The webhook URL (and optional
// auth header) only ever live on the server; the browser talks to /api/fuse.
import { Buffer } from 'node:buffer'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_BODY_BYTES = 2 * MAX_FILE_BYTES + 64 * 1024
const MAX_RESULT_BYTES = 25 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 120_000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// Identify images by their magic bytes rather than trusting the client's MIME type
function detectImageType(buf) {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function sendError(res, status, message, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify({ error: message }))
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'])
    if (declared > limit) return reject(new HttpError(413, 'Upload is too large. Each image must be 10 MB or less.'))

    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new HttpError(413, 'Upload is too large. Each image must be 10 MB or less.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', () => reject(new HttpError(400, 'Upload was interrupted.')))
  })
}

export function createFuseHandler(env) {
  const webhookUrl = env.WEBHOOK_URL
  const authHeaderName = env.WEBHOOK_AUTH_HEADER
  const authHeaderValue = env.WEBHOOK_AUTH_VALUE
  const trustProxy = env.TRUST_PROXY === 'true'

  const hits = new Map()

  function isRateLimited(ip) {
    const now = Date.now()
    if (hits.size > 10_000) {
      for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key)
    }
    const entry = hits.get(ip)
    if (!entry || entry.reset <= now) {
      hits.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS })
      return false
    }
    entry.count += 1
    return entry.count > RATE_LIMIT_MAX
  }

  function clientIp(req) {
    if (trustProxy) {
      const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      if (forwarded) return forwarded
    }
    return req.socket.remoteAddress || 'unknown'
  }

  return async function handleFuse(req, res) {
    if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed.', { Allow: 'POST' })
    if (!webhookUrl) {
      console.error('[fuse] WEBHOOK_URL is not set')
      return sendError(res, 500, 'The server is not configured.')
    }

    const contentType = req.headers['content-type'] || ''
    if (!contentType.startsWith('multipart/form-data')) return sendError(res, 415, 'Expected a multipart upload.')
    if (isRateLimited(clientIp(req))) {
      return sendError(res, 429, 'Too many requests. Please wait a minute and try again.', { 'Retry-After': '60' })
    }

    try {
      const body = await readBody(req, MAX_BODY_BYTES)

      let form
      try {
        form = await new Request('http://localhost/', { method: 'POST', headers: { 'content-type': contentType }, body }).formData()
      } catch {
        throw new HttpError(400, 'Malformed upload.')
      }

      // Rebuild the form so only validated images (with sanitized names) reach the webhook
      const outgoing = new FormData()
      for (const field of ['image1', 'image2']) {
        const file = form.get(field)
        if (!(file instanceof Blob)) throw new HttpError(400, `Missing ${field}.`)
        if (file.size > MAX_FILE_BYTES) throw new HttpError(413, 'Each image must be 10 MB or less.')
        const buf = Buffer.from(await file.arrayBuffer())
        const type = detectImageType(buf)
        if (!type) throw new HttpError(415, `${field} must be a JPEG, PNG or WebP image.`)
        outgoing.append(field, new Blob([buf], { type }), `${field}.${EXTENSIONS[type]}`)
      }

      const headers = {}
      if (authHeaderName && authHeaderValue) headers[authHeaderName] = authHeaderValue

      let upstream
      try {
        upstream = await fetch(webhookUrl, {
          method: 'POST',
          body: outgoing,
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        })
      } catch (err) {
        if (err.name === 'TimeoutError') throw new HttpError(504, 'The image service took too long to respond.')
        console.error('[fuse] upstream request failed:', err.message)
        throw new HttpError(502, 'Could not reach the image service.')
      }

      if (!upstream.ok) {
        // Don't forward upstream error bodies; they can leak workflow internals
        console.error('[fuse] upstream responded with status', upstream.status)
        throw new HttpError(502, 'The image service returned an error. Please try again.')
      }
      if (Number(upstream.headers.get('content-length')) > MAX_RESULT_BYTES) {
        throw new HttpError(502, 'The generated image is too large.')
      }

      const result = Buffer.from(await upstream.arrayBuffer())
      const resultType = result.length <= MAX_RESULT_BYTES && detectImageType(result)
      if (!resultType) {
        console.error('[fuse] upstream returned a non-image response')
        throw new HttpError(502, 'The image service did not return a supported image.')
      }

      res.writeHead(200, {
        'Content-Type': resultType,
        'Content-Length': result.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(result)
    } catch (err) {
      if (err instanceof HttpError) return sendError(res, err.status, err.message)
      console.error('[fuse] unexpected error:', err)
      sendError(res, 500, 'Something went wrong.')
    }
  }
}
