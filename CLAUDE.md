# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev`: Vite dev server at http://localhost:5173
- `npm run build`: production build to `dist/`
- `npm run preview`: serve the built `dist/`

There is no linter, test runner or TypeScript. `npm run build` is the only automated check.

## What this app is

A single-page React 19 + Vite + Tailwind CSS v4 app. The user uploads two images: `image1` (the person) and `image2` (the clothing). The app POSTs them to an n8n webhook and displays the generated image that comes back.

## Architecture

- `src/App.jsx` owns all state and logic. The two cards in `src/components/` are presentational and receive everything through props.
  - State: `image1`, `image2`, `preview1`, `preview2`, `isLoading`, `resultImage`, `errorMessage`.
  - `UploadCard` handles file picking and drag-and-drop, then calls `onSelect(file)`. Validation happens in `App.handleFile`, not in the card.
- **API contract** (in `handleSubmit`):
  - `POST` to `WEBHOOK_URL`, with the body as `FormData` fields `image1` and `image2`.
  - Never set `Content-Type` manually. The browser must add the multipart boundary.
  - The response is a **binary image, not JSON**. It is read with `response.blob()` and displayed through `URL.createObjectURL`.
- `WEBHOOK_URL` comes from `VITE_WEBHOOK_URL` in a `.env` file.
- **Allowed uploads:** only `.jpg`, `.jpeg`, `.png` and `.webp`. A file must pass both the MIME check and the extension check (`isAllowedFile`). The `accept` attribute in `UploadCard` must stay in sync with these rules.
- **Object URLs:** every preview or result URL is revoked when it is replaced or removed, and all of them are revoked on unmount through `urlsRef`. Keep this discipline when adding new blob URLs.
- **Network errors:** a `TypeError` from `fetch` usually means the n8n webhook isn't sending CORS headers. The fix is the webhook's "Allowed Origins" setting in n8n, not frontend code.

## Styling

- Tailwind v4 is configured CSS-first: there's no `tailwind.config.js`, and design tokens live in `@theme` in `src/index.css`.
  - Tokens: `ink`, `muted`, `line`, `canvas`, and the Jost font, which is loaded in `index.html`.
- The UI copies the visual language of the reference screenshot (`screenshot_2026-11-04_09-54-14.png`), a luxury-retail product-listing page:
  - wide-tracked uppercase wordmark
  - hairline notice band
  - breadcrumb, large H1 and pill chips
  - black and outlined action-button pair
  - 4-column grid of thin-bordered cards
- Don't use the retailer's actual name or logo. The wordmark is the neutral "IMAGE FUSION".
