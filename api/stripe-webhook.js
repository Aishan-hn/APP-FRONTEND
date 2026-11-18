// Vercel Function for /api/stripe-webhook. Webhook logic stays in stripe-webhook-handler.js.
import { createStripeWebhookHandler } from '../server/stripe-webhook-handler.js'

export default createStripeWebhookHandler(process.env)
