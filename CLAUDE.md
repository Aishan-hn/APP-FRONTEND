# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev`: Vite dev server at http://localhost:5173, with the `/api/fuse` proxy mounted as middleware
- `npm run build`: production build to `dist/`
- `npm run preview`: serve `dist/` with the proxy and security headers
- `npm start`: production Node server (`server.js`) on `PORT` (default 3000). It reads `.env` if the file exists. Run `npm run build` first.

There is no linter, test runner or TypeScript. `npm run build` is the only automated check.

Setup: copy `.env.example` to `.env` and set `WEBHOOK_URL`. Node 22.9 or later is required, for `--env-file-if-exists`. `README.md` is the user-facing doc for setup, deployment and troubleshooting; keep it in sync when commands, env vars or limits change.

- **Testing the proxy:** don't hit the real n8n webhook. Point `WEBHOOK_URL` at a throwaway local HTTP server that returns image bytes, then run `server.js` against it.
- **OneDrive problem:** the project lives in a OneDrive-synced folder, so Vite's dependency re-optimization can fail with `EPERM ... rename node_modules\.vite\deps_temp_*`. Fix it by deleting `node_modules/.vite` and restarting the dev server.
- **Restarting the dev server:** on Windows, stopping the `npm run dev` shell can leave the `vite.js` node process orphaned and still holding the port. Find it by port (`netstat -ano`) before restarting.

## What this app is

A React 19 + Vite + Tailwind CSS v4 single-page app with a small Node proxy. The user uploads two images: `image1` (the person) and `image2` (the clothing). The browser POSTs them to the same-origin `/api/fuse`. The proxy forwards them to an n8n webhook and returns the generated image.

## Architecture

- **The webhook URL is a server-side secret.**
  - The browser only ever calls `/api/fuse`.
  - `WEBHOOK_URL`, plus the optional `WEBHOOK_AUTH_HEADER` / `WEBHOOK_AUTH_VALUE` for n8n Header Auth, are read from `.env` by the server only.
  - Never give secrets a `VITE_` prefix: Vite inlines those into the client bundle. `vite.config.js` throws an error if a secret-looking `VITE_*` variable is set.
- `server/fuse-handler.js` contains the proxy logic as a plain Node `(req, res)` handler created by `createFuseHandler(env)`. It is mounted in two places:
  - `vite.config.js`, in both the dev and preview servers (through a plugin that uses `loadEnv(mode, cwd, '')`)
  - `server.js`, the production server, which also serves `dist/` as static files
  - Change proxy behaviour in the handler module, not in those two files.
- What the handler does:
  - limits each request body to about 20 MB and each file to 10 MB
  - parses the multipart upload with the built-in `Request#formData()`
  - checks each file's real type from its magic bytes (JPEG, PNG or WebP only)
  - rebuilds the form with sanitized filenames before forwarding it
  - rate-limits to 10 requests per minute per IP, held in memory (`TRUST_PROXY=true` makes it use `X-Forwarded-For`)
  - applies a 120 s timeout to the upstream call
  - checks that the response is an image by its magic bytes
  - never forwards upstream error bodies to the browser; errors come back as JSON `{ error }`
- `server/security-headers.js` holds the CSP and other hardening headers. They are applied in `server.js` and `vite preview`, but not in dev, because HMR needs inline scripts.
  - The CSP allows only `'self'` plus `blob:`/`data:` images. Any new external script, font or API must be added there, or it will be blocked.
- `src/App.jsx` owns all client state and logic. The two cards in `src/components/` are presentational and receive everything through props.
  - State: `image1`, `image2`, `preview1`, `preview2`, `isLoading`, `resultImage`, `errorMessage`.
  - `UploadCard` handles file picking and drag-and-drop, then calls `onSelect(file)`. Validation happens in `App.handleFile`, not in the card.
- **Client request** (in `handleSubmit`):
  - `POST /api/fuse` with `FormData` fields `image1` and `image2`.
  - Never set `Content-Type` manually; the browser must add the multipart boundary.
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
