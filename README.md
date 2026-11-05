# Image Fusion

Upload a photo of a person and a photo of a piece of clothing, and get back a generated image of the two combined. An n8n workflow does the image generation. This app is the web front end plus a small proxy that keeps the webhook private.

## Requirements

- Node.js 22.9 or newer
- An n8n workflow with a Webhook node that:
  - accepts `multipart/form-data` with the fields `image1` (person) and `image2` (clothing)
  - responds with the generated image as binary data (JPEG, PNG or WebP)

## Setup

```bash
npm install
cp .env.example .env
```

Then edit `.env`:

| Variable | Required | Description |
|---|---|---|
| `WEBHOOK_URL` | yes | Your n8n webhook URL |
| `WEBHOOK_AUTH_HEADER` | no | Header name, if the Webhook node uses Header Auth |
| `WEBHOOK_AUTH_VALUE` | no | Header value for Header Auth |
| `PORT` | no | Port for `npm start` (default `3000`) |
| `HOST` | no | Interface for `npm start` (default `127.0.0.1`) |
| `TRUST_PROXY` | no | Set to `true` only when running behind a reverse proxy, so rate limiting uses the real client IP |

> **Never prefix these variables with `VITE_`.** Vite copies `VITE_*` variables into the JavaScript sent to the browser, where anyone can read them. The dev server and `npm run build` refuse to run if a secret-looking `VITE_` variable is set, whether it comes from `.env` or from the host's environment (such as your hosting dashboard).

## Running

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload at http://localhost:5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the production build locally, with security headers |
| `npm start` | Production server: serves `dist/` and the API on `PORT` (run `npm run build` first) |

All modes include the `/api/fuse` proxy, so the app works the same in development and production.

## How it works

```
Browser ──POST /api/fuse──▶ Node proxy ──POST WEBHOOK_URL──▶ n8n
        ◀──── image ───────            ◀────── image ──────
```

The browser never sees the webhook URL. The proxy (`server/fuse-handler.js`):

- accepts only real JPEG, PNG or WebP files, checked by file content rather than name or extension, up to 10 MB each
- replaces uploaded filenames before forwarding them
- limits each client to 10 requests per minute
- times out the n8n call after 2 minutes
- checks that n8n actually returned an image
- returns generic error messages instead of n8n's own errors

The production server also sends security headers (Content Security Policy, frame blocking, no referrer, etc.). The font is bundled with the app rather than loaded from Google Fonts.

## Deployment

- Use a host that can run Node, such as a VPS, Render, Railway or Fly.io. A static-only host won't work, because the proxy has to run on the server.
- Run `npm ci && npm run build && npm start`, with the environment variables set on the host.
- Serve it over HTTPS, typically behind a reverse proxy. Set `TRUST_PROXY=true` when you do.
- In n8n, enable **Header Auth** on the Webhook node and put the credentials in `WEBHOOK_AUTH_HEADER` and `WEBHOOK_AUTH_VALUE`. Otherwise anyone who learns the URL can call the webhook directly.

### Vercel

Vercel's static hosting serves `dist/` but doesn't run `server.js`, so `/api/fuse` won't exist and uploads will fail. Use one of the Node hosts above, or add a Vercel Function for `/api/fuse` that wraps `createFuseHandler` from `server/fuse-handler.js`.

When setting environment variables in Vercel (Project → Settings → Environment Variables):

- Use the plain names: `WEBHOOK_URL`, `WEBHOOK_AUTH_HEADER`, `WEBHOOK_AUTH_VALUE`.
- Don't add any `VITE_` variable whose name contains `WEBHOOK`, `SECRET`, `TOKEN`, `KEY` or `AUTH`. Vite reads every variable in the build environment, so a variable set only in the dashboard still fails the build (see Troubleshooting).
- The app doesn't use Stripe. If you add Stripe later, server-side secrets (`sk_…` keys, `whsec_…` webhook secrets) must not have the `VITE_` prefix. A publishable key (`pk_…`) is public, but `VITE_STRIPE_PUBLISHABLE_KEY` still trips the check because its name contains `KEY`. Allow that one name explicitly in `vite.config.js` rather than loosening the pattern.

## Troubleshooting

- **`EPERM: operation not permitted, rename ... node_modules\.vite\deps`**: OneDrive (or antivirus software) has locked Vite's cache folder. Delete `node_modules/.vite` and restart the dev server. To avoid it altogether, keep the project outside a OneDrive-synced folder.
- **`Error: Secrets must not use the VITE_ prefix`** (during `vite build`, for example on Vercel): a `VITE_*` variable with `WEBHOOK`, `SECRET`, `TOKEN`, `KEY` or `AUTH` in its name is set. If `.env` is clean, look in your host's environment variables. Delete it, or rename it without the prefix (e.g. `VITE_WEBHOOK_URL` → `WEBHOOK_URL`). If a secret was ever deployed with the `VITE_` prefix in a successful build, it was public: rotate it.
- **"The server is not configured."**: `WEBHOOK_URL` is missing from `.env`.
- **"The image service returned an error."**: n8n responded with an error status. Check the workflow's execution log in n8n.
- **"The image service did not return a supported image."**: the workflow's response isn't JPEG, PNG or WebP. Make sure the Respond to Webhook node returns the binary image.
