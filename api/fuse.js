// Vercel Function for /api/fuse. Vercel serves dist/ statically and doesn't run
// server.js, so the proxy runs here instead. Proxy logic stays in fuse-handler.js.
import { createFuseHandler } from '../server/fuse-handler.js'

// Vercel sets X-Forwarded-For to the real client IP and drops any client-supplied
// value, so it is safe to trust for rate limiting. The socket address is Vercel's.
export default createFuseHandler({ ...process.env, TRUST_PROXY: 'true' })
