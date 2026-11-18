import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createFuseHandler } from './server/fuse-handler.js'
import { createStripeWebhookHandler } from './server/stripe-webhook-handler.js'
import { applySecurityHeaders } from './server/security-headers.js'

export default defineConfig(({ command, mode }) => {
  // Load every .env variable for server-side use only. Only VITE_* variables reach
  // the browser bundle, so secrets must never use that prefix.
  const env = loadEnv(mode, process.cwd(), '')
  // Report names only, never values: this message ends up in hosted build logs.
  // VITE_VERCEL_* are Vercel's own system variables (e.g. ..._COMMIT_AUTHOR_NAME), not secrets.
  // A Supabase publishable key is public by design (RLS protects the data); a
  // secret or service_role key must never be exposed, so only this one name is allowed.
  const PUBLIC_KEYS = ['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_STRIPE_PAYMENT_LINK', 'VITE_STRIPE_PORTAL_URL']
  const leaked = Object.keys(env).filter(
    (key) =>
      key.startsWith('VITE_') &&
      !key.startsWith('VITE_VERCEL_') &&
      !PUBLIC_KEYS.includes(key) &&
      /WEBHOOK|SECRET|TOKEN|KEY|AUTH/i.test(key),
  )
  if (leaked.length) {
    throw new Error(
      `Secrets must not use the VITE_ prefix; it would bundle them into the client. Remove or rename: ${leaked.join(', ')}. Use WEBHOOK_URL instead.`,
    )
  }

  // VITE_* values are inlined at build time. Without the payment link, the Subscribe
  // button becomes the relative URL "undefined?..." and 404s, so fail the build instead.
  // The portal link stays optional: the app hides "Manage subscription" without it.
  if (command === 'build' && !/^https:\/\/\S+$/.test(env.VITE_STRIPE_PAYMENT_LINK ?? '')) {
    throw new Error(
      'VITE_STRIPE_PAYMENT_LINK must be set to the Stripe payment link URL (https://buy.stripe.com/...) before building. On Vercel, add it under Settings -> Environment Variables, then redeploy.',
    )
  }

  const handleFuse = createFuseHandler(env)
  const handleStripeWebhook = createStripeWebhookHandler(env)

  const fuseApi = {
    name: 'fuse-api',
    configureServer(server) {
      server.middlewares.use('/api/fuse', handleFuse)
      server.middlewares.use('/api/stripe-webhook', handleStripeWebhook)
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        applySecurityHeaders(res)
        next()
      })
      server.middlewares.use('/api/fuse', handleFuse)
      server.middlewares.use('/api/stripe-webhook', handleStripeWebhook)
    },
  }

  return {
    plugins: [react(), tailwindcss(), fuseApi],
  }
})
