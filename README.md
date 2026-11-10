# Image Fusion

Upload a photo of a person and a photo of a piece of clothing, and get back a generated image of the two combined. An n8n workflow does the image generation. This app is the web front end plus a small proxy that keeps the webhook private.

## Requirements

- Node.js 22.9 or newer
- An n8n workflow with a Webhook node that:
  - accepts `multipart/form-data` with the fields `image1` (person) and `image2` (clothing)
  - responds with the generated image as binary data (JPEG, PNG or WebP)
- A Supabase project for sign-in (email + password, with email confirmation)

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
| `VITE_SUPABASE_URL` | yes | Supabase project URL, e.g. `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase **publishable** key (`sb_publishable_…`). Public by design; never use a secret or `service_role` key here |
| `PORT` | no | Port for `npm start` (default `3000`) |
| `HOST` | no | Interface for `npm start` (default `127.0.0.1`) |
| `TRUST_PROXY` | no | Set to `true` only when running behind a reverse proxy, so rate limiting uses the real client IP |

> **Never prefix the other variables with `VITE_`.** Vite copies `VITE_*` variables into the JavaScript sent to the browser, where anyone can read them. The dev server and `npm run build` refuse to run if a secret-looking `VITE_` variable is set, whether it comes from `.env` or from the host's environment (such as your hosting dashboard).

### Supabase

- **Database:** a `public.profiles` table (`id`, `full_name`, `created_at`) with Row Level Security. Users can only read and update their own row. A trigger on `auth.users` creates the row at sign-up, copying the name from the user's metadata.
- **Auth → URL Configuration:** set **Site URL** to your production domain, and add `http://localhost:5173` and `http://localhost:3000` under **Redirect URLs**. The confirmation email links back to the page the user signed up from.
- **Auth → Providers → Email:** keep **Confirm email** on. Set the minimum password length to 8 to match the sign-up form.
- **Before launch:** set up custom SMTP (Auth → SMTP Settings). Supabase's built-in mailer only sends a few emails per hour.

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

The browser never sees the webhook URL. Users sign in with Supabase (email and password). The app sends the session's access token as `Authorization: Bearer …`. The proxy (`server/fuse-handler.js`):

- rejects requests without a valid signed-in user's token (401), checking the token's signature against the Supabase project's keys
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

Vercel doesn't run `server.js`. Instead, it serves `dist/` statically and runs the proxy as a Vercel Function (`api/fuse.js`). `vercel.json` sets the build, the function's timeout and the security headers. Import the repo into Vercel and set the environment variables; no other configuration is needed.

Limits that differ from `npm start`:

- **Upload size: about 4.5 MB per request in total, across both images.** Vercel rejects larger request bodies before the function runs, and the browser shows "Request failed (413)." The 10 MB-per-image limit only applies on a Node host.
- **Rate limiting is per function instance.** Vercel can run several instances at once, so a client may get more than 10 requests per minute. `TRUST_PROXY` is always on in the function, because Vercel sets `X-Forwarded-For` itself.
- **Timeout:** `maxDuration` is 150 s. On the Hobby plan without Fluid compute the cap is lower (60 s), so slow workflows can time out.

When setting environment variables in Vercel (Project → Settings → Environment Variables):

- Use the plain names: `WEBHOOK_URL`, `WEBHOOK_AUTH_HEADER`, `WEBHOOK_AUTH_VALUE`.
- Also set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The build needs them for the browser, and the function needs them to verify sign-ins. Redeploy after adding them.
- Don't add any other `VITE_` variable whose name contains `WEBHOOK`, `SECRET`, `TOKEN`, `KEY` or `AUTH`. Vite reads every variable in the build environment, so a variable set only in the dashboard still fails the build (see Troubleshooting).
- The app doesn't use Stripe. If you add Stripe later, server-side secrets (`sk_…` keys, `whsec_…` webhook secrets) must not have the `VITE_` prefix. A publishable key (`pk_…`) is public, but `VITE_STRIPE_PUBLISHABLE_KEY` still trips the check because its name contains `KEY`. Allow that one name explicitly in `vite.config.js` rather than loosening the pattern.

## Troubleshooting

- **`EPERM: operation not permitted, rename ... node_modules\.vite\deps`**: OneDrive (or antivirus software) has locked Vite's cache folder. Delete `node_modules/.vite` and restart the dev server. To avoid it altogether, keep the project outside a OneDrive-synced folder.
- **`Error: Secrets must not use the VITE_ prefix`** (during `vite build`, for example on Vercel): a `VITE_*` variable with `WEBHOOK`, `SECRET`, `TOKEN`, `KEY` or `AUTH` in its name is set. If `.env` is clean, look in your host's environment variables. Delete it, or rename it without the prefix (e.g. `VITE_WEBHOOK_URL` → `WEBHOOK_URL`). If a secret was ever deployed with the `VITE_` prefix in a successful build, it was public: rotate it.
- **"The server is not configured."**: `WEBHOOK_URL`, `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is missing.
- **"Please sign in to continue." / "Your session expired."**: the proxy rejected the access token. Sign out and in again.
- **Confirmation link opens the wrong site or shows an error**: add that origin to Supabase's Redirect URLs (see Setup → Supabase).
- **Supabase requests blocked by CSP**: if you change Supabase projects, update the origin in `connect-src` in both `server/security-headers.js` and `vercel.json`.
- **"The image service returned an error."**: n8n responded with an error status. Check the workflow's execution log in n8n.
- **"The image service did not return a supported image."**: the workflow's response isn't JPEG, PNG or WebP. Make sure the Respond to Webhook node returns the binary image.
