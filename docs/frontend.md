# Frontend Development

## Overview

htmx + Alpine.js. No build step for development. Production build via `bun run build:frontend`.

## Tech Stack

| Layer        | Technology                | Notes                                                    |
| ------------ | ------------------------- | -------------------------------------------------------- |
| HTML         | Prebuilt static templates | Server replaces `{{{content}}}` in layout.html           |
| AJAX         | htmx 2.x                  | Partial page updates, server-driven UI                   |
| Client state | Alpine.js 3.x             | Modals, toasts, local UI toggles (not data state)        |
| Styling      | Hand-authored CSS         | 3 files: theme.css, app.css, gallery.css. No framework.  |
| Icons        | Unicode / SVG             | No icon library dependency. Inline SVGs where needed.    |

## Development

### Prerequisites

- [Bun](https://bun.sh) v1.0+

### Start

### Production Build

## Scripts

| Command                  | Purpose                               |
| ------------------------ | ------------------------------------- |
| `bun run dev`            | Dev server (hot reload)               |
| `bun run start`          | Production server                     |
| `bun run build`          | Build all assets (frontend + server)  |
| `bun run build:frontend` | Build browser bundle only             |
| `bun run build:server`   | Build server bundle only              |

## TypeScript

### Server

`tsconfig.json` — ES2022, Bundler, strict.

### Browser

`tsconfig.frontend.json` — ES2022 + DOM lib, ESNext module, no Bun types.

### Type Checking

## Asset Pipeline

Build output: `dist/public/` (static assets) + `dist/server.js` (bundled server).

All HTML/CSS/JS pre-compressed at build time: `.gz`, `.br`. Server checks `Accept-Encoding` and serves compressed variant directly.

## Source Structure

`src/frontend/`: `index.ts` (public exports), `browser.ts` (browser crypto/compress), plus Alpine modules.

## CSS Architecture

No Tailwind, no CSS-in-JS. Three files:

1. **theme.css** — CSS custom properties (design tokens), global resets
2. **app.css** — Layout system, component classes
3. **gallery.css** — Asset gallery components

### Design Tokens

| Token              | Value     | Purpose                                  |
| ------------------ | --------- | ---------------------------------------- |
| `--bg-primary`     | `#151820` | Page background                          |
| `--bg-secondary`   | `#21242c` | Sidebar, card surfaces                   |
| `--text-primary`   | `#fffdf5` | Body text                                |
| `--accent-primary` | `#f597e8` | Buttons, highlights, user bubbles (pink) |
| `--accent-blue`    | `#0072ff` | Info                                     |
| `--accent-green`   | `#29cc6a` | Success                                  |
| `--accent-red`     | `#fc5555` | Error, danger                            |

## Browser Utilities

`src/frontend/browser.ts`: Compression (gzip, brotli), encryption (AES-256-GCM via WebCrypto), Base64 encoding.

## Docs Index

| File                                                | Pages covered                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `frontend/overview.md`                              | Design principles, CSS tokens, tech stack                          |
| `frontend/routing.md`                               | URL structure, navigation patterns, htmx history                   |
| `frontend/chat/overview.md`                         | Chat types, data model, message tree, chat master                  |
| `frontend/chat/layout.md`                           | Hamburger sidebar, centered configurable width, panels, responsive |
| `frontend/chat/messages.md`                         | Markdown render, message bubbles, detail levels, tooling, swipe    |
| `frontend/chat/generation.md`                       | Typing indicator, streaming, error handling                        |
| `frontend/characters.md`                            | Character list grid, create/edit form                              |
| `frontend/gallery.md`                               | Asset gallery grid, preview modal, upload dialog                   |
| `frontend/settings.md`                              | Settings sections: general, chat, API config                       |
| `frontend/components.md`                            | Shared components: toasts, modals, spinners, chips, drop zones     |
| `frontend/`                                         | All frontend UX specifications                                     |

## Related Docs

- `docs/spec/build-deploy.md` — Build pipeline
- `docs/spec/implementation.md` — Tech stack overview
- `docs/spec/assets.md` — Asset upload and linking