# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev`: Vite dev server at http://localhost:5173, with the `/api/fuse` proxy mounted as middleware
- `npm run build`: production build to `dist/`
- `npm run preview`: serve `dist/` with the proxy and security headers
- `npm start`: production Node server (`server.js`) on `PORT` (default 3000). It reads `.env` if the file exists. Run `npm run build` first.

There is no linter, test runner or TypeScript. `npm run build` is the only automated check.

Setup: copy `.env.example` to `.env` and set `WEBHOOK_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Node 22.9 or later is required, for `--env-file-if-exists`. `README.md` is the user-facing doc for setup, deployment and troubleshooting; keep it in sync when commands, env vars or limits change.

- **Testing the proxy:** don't hit the real n8n webhook. Point `WEBHOOK_URL` at a throwaway local HTTP server that returns image bytes, then run `server.js` against it. Requests now need `Authorization: Bearer <access token of a signed-in Supabase user>`, or they get a 401.
- **OneDrive problem:** the project lives in a OneDrive-synced folder, so Vite's dependency re-optimization can fail with `EPERM ... rename node_modules\.vite\deps_temp_*`. Fix it by deleting `node_modules/.vite` and restarting the dev server.
- **Restarting the dev server:** on Windows, stopping the `npm run dev` shell can leave the `vite.js` node process orphaned and still holding the port. Find it by port (`netstat -ano`) before restarting.

## What this app is

A React 19 + Vite + Tailwind CSS v4 single-page app with a small Node proxy. The user uploads two images: `image1` (the person) and `image2` (the clothing). The browser POSTs them to the same-origin `/api/fuse`. The proxy forwards them to an n8n webhook and returns the generated image.

## Architecture

- **The webhook URL is a server-side secret.**
  - The browser only ever calls `/api/fuse`.
  - `WEBHOOK_URL`, plus the optional `WEBHOOK_AUTH_HEADER` / `WEBHOOK_AUTH_VALUE` for n8n Header Auth, are read from `.env` by the server only.
  - Never give secrets a `VITE_` prefix: Vite inlines those into the client bundle. `vite.config.js` throws an error if a secret-looking `VITE_*` variable is set.
  - The one exception is `VITE_SUPABASE_PUBLISHABLE_KEY`, which is listed by name in `PUBLIC_KEYS`, because a publishable key is public by design. Never allow a Supabase secret or `service_role` key.
- `server/fuse-handler.js` contains the proxy logic as a plain Node `(req, res)` handler created by `createFuseHandler(env)`. It is mounted in two places:
  - `vite.config.js`, in both the dev and preview servers (through a plugin that uses `loadEnv(mode, cwd, '')`)
  - `server.js`, the production server, which also serves `dist/` as static files
  - `api/fuse.js`, the Vercel Function (Vercel doesn't run `server.js`). It forces `TRUST_PROXY=true`, because Vercel sets `X-Forwarded-For` itself. Vercel caps request bodies at about 4.5 MB, below the handler's limits.
  - Change proxy behaviour in the handler module, not in those three files.
- **Auth (Supabase, project `srjtwpvoytjlbezdmchv`):**
  - `src/lib/supabase.js` is the browser client (PKCE). `App.jsx` holds `session` / `authReady` from `getSession` + `onAuthStateChange`, and renders `src/components/AuthScreen.jsx` when signed out. `AuthScreen` keeps its own form state and calls `signUp` (name goes in `options.data.full_name`) or `signInWithPassword`.
  - Email confirmation is on, so `signUp` returns no session until the user clicks the link.
  - Forgot password: `resetPasswordForEmail` with `redirectTo: window.location.origin`. The link signs the user in and fires `PASSWORD_RECOVERY`, which sets `isRecovering` in App. App then keeps rendering `AuthScreen` in `reset` mode until `updateUser({ password })` succeeds. With PKCE, the link only works in the browser that requested it.
  - `public.profiles` (RLS, own row only) is filled by the `handle_new_user` trigger on `auth.users`.
  - The handler also reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` and verifies the Bearer token with `auth.getClaims`. It requires `role === 'authenticated'`, because the anon key is itself a valid JWT.
- What the handler does:
  - limits each request body to about 20 MB and each file to 10 MB
  - parses the multipart upload with the built-in `Request#formData()`
  - checks each file's real type from its magic bytes (JPEG, PNG or WebP only)
  - rebuilds the form with sanitized filenames before forwarding it
  - after the rate-limit check and before reading the body, returns 401 unless the request has a valid signed-in user's token
  - rate-limits to 10 requests per minute per IP, held in memory (`TRUST_PROXY=true` makes it use `X-Forwarded-For`)
  - applies a 120 s timeout to the upstream call
  - checks that the response is an image by its magic bytes
  - never forwards upstream error bodies to the browser; errors come back as JSON `{ error }`
- `server/security-headers.js` holds the CSP and other hardening headers. They are applied in `server.js` and `vite preview`, but not in dev, because HMR needs inline scripts.
  - `vercel.json` repeats the same headers for Vercel, which can't import JS for static responses. Keep the two identical.
  - The CSP allows only `'self'` plus `blob:`/`data:` images, and the Supabase project origin in `connect-src`. Any new external script, font or API must be added there, or it will be blocked.
- `src/App.jsx` owns all client state and logic. The two cards in `src/components/` are presentational and receive everything through props.
  - State: `session`, `authReady`, `isRecovering`, `image1`, `image2`, `preview1`, `preview2`, `isLoading`, `resultImage`, `errorMessage`.
  - `UploadCard` handles file picking and drag-and-drop, then calls `onSelect(file)`. Validation happens in `App.handleFile`, not in the card.
- **Client request** (in `handleSubmit`):
  - `POST /api/fuse` with `FormData` fields `image1` and `image2`.
  - Never set `Content-Type` manually; the browser must add the multipart boundary.
  - It sends `Authorization: Bearer ${session.access_token}`.
  - A successful response is a **binary image, not JSON**. It is read with `response.blob()` and displayed through `URL.createObjectURL`.
- **Allowed uploads:** `.jpg`, `.jpeg`, `.png` and `.webp`, up to 10 MB each. These rules are repeated in three places that must stay in sync:
  - the client checks in `App.jsx` (`isAllowedFile` and `MAX_FILE_BYTES`)
  - the `accept` attribute in `UploadCard`
  - the server checks in `fuse-handler.js`, which are the ones actually enforced
- **Object URLs:** every preview or result URL is revoked when it is replaced or removed, and all of them are revoked on unmount through `urlsRef`. Keep this discipline when adding new blob URLs.

## Styling

- Tailwind v4 is configured CSS-first: there's no `tailwind.config.js`, and design tokens live in `@theme` in `src/index.css`.
  - Tokens: `ink`, `muted`, `line`, `canvas`, and the Jost font.
  - Jost is self-hosted through `@fontsource/jost`, imported in `src/main.jsx`. Don't switch back to Google Fonts: the CSP blocks it, and it would send user IPs to Google.
- The UI copies the visual language of the reference screenshot (`screenshot_2026-11-04_09-54-14.png`), a luxury-retail product-listing page:
  - wide-tracked uppercase wordmark
  - hairline notice band
  - breadcrumb, large H1 and pill chips
  - black and outlined action-button pair
  - 4-column grid of thin-bordered cards
- Don't use the retailer's actual name or logo. The wordmark is the neutral "IMAGE FUSION".
