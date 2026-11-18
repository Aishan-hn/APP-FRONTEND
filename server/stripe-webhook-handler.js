// Stripe webhook: records subscriptions bought through the payment link in
// public.subscriptions. Stripe's signature is the only authentication, so every
// request is verified against STRIPE_WEBHOOK_SECRET before anything is trusted.
import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const MAX_BODY_BYTES = 1024 * 1024
// Same default tolerance as Stripe's SDKs; rejects replayed deliveries
const SIGNATURE_TOLERANCE_S = 300

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// Implements https://docs.stripe.com/webhooks#verify-manually: HMAC-SHA256 of
// "<timestamp>.<raw body>" keyed with the endpoint secret, compared in constant time
// against every v1 signature in the Stripe-Signature header.
export function verifyStripeSignature(rawBody, header, secret, now = Date.now()) {
  if (!header) return false
  let timestamp = null
  const signatures = []
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2)
    if (key === 't') timestamp = Number(value)
    else if (key === 'v1' && value) signatures.push(value)
  }
  if (!Number.isInteger(timestamp) || !signatures.length) return false
  if (Math.abs(now / 1000 - timestamp) > SIGNATURE_TOLERANCE_S) return false

  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest()
  return signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

const toTimestamp = (seconds) => (seconds ? new Date(seconds * 1000).toISOString() : null)
const idOf = (value) => (typeof value === 'string' ? value : (value?.id ?? null))

export function createStripeWebhookHandler(env) {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET
  const paymentLinkId = env.STRIPE_PAYMENT_LINK_ID

  // Server-only secret key: the subscription write functions are granted to service_role only
  const supabase =
    env.VITE_SUPABASE_URL && env.SUPABASE_SECRET_KEY
      ? createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : null

  async function handleEvent(event) {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode !== 'subscription' || !session.subscription) return
        // Only checkouts from our payment link grant access
        if (idOf(session.payment_link) !== paymentLinkId) return

        const { data: userId, error } = await supabase.rpc('record_checkout', {
          p_subscription_id: idOf(session.subscription),
          p_customer_id: idOf(session.customer),
          p_client_reference_id: session.client_reference_id,
          p_email: session.customer_details?.email ?? null,
          p_paid: session.payment_status === 'paid',
        })
        if (error) throw error
        if (!userId) console.warn('[stripe-webhook] no matching user for checkout', session.id)
        return
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        // current_period_end lives on subscription items in current API versions
        const periodEnd = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end
        const { error } = await supabase.rpc('apply_subscription_event', {
          p_subscription_id: sub.id,
          p_customer_id: idOf(sub.customer),
          p_status: sub.status,
          p_current_period_end: toTimestamp(periodEnd),
          p_event_at: toTimestamp(event.created),
        })
        if (error) throw error
      }
    }
  }

  return async function handleStripeWebhook(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return send(res, 405, { error: 'Method not allowed.' })
    }
    if (!webhookSecret || !paymentLinkId || !supabase) {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET, STRIPE_PAYMENT_LINK_ID, VITE_SUPABASE_URL or SUPABASE_SECRET_KEY is not set')
      return send(res, 500, { error: 'Not configured.' })
    }

    let rawBody
    try {
      rawBody = await readRawBody(req)
    } catch {
      return send(res, 413, { error: 'Payload too large.' })
    }

    // Verify against the exact bytes Stripe sent, before parsing anything
    if (!verifyStripeSignature(rawBody, req.headers['stripe-signature'], webhookSecret)) {
      return send(res, 400, { error: 'Invalid signature.' })
    }

    let event
    try {
      event = JSON.parse(rawBody.toString('utf8'))
    } catch {
      return send(res, 400, { error: 'Invalid payload.' })
    }

    try {
      await handleEvent(event)
    } catch (err) {
      // A non-2xx makes Stripe retry the delivery
      console.error('[stripe-webhook] failed to handle', event.type, event.id, err.message)
      return send(res, 500, { error: 'Handler error.' })
    }
    send(res, 200, { received: true })
  }
}
