# Frontend Development

## Overview

The frontend uses **htmx + Alpine.js** — lightweight, no build step for development.
Browser bundles are built for production via `bun run build:frontend`.

## Tech Stack

| Layer        | Technology                | Notes                                                                |
| ------------ | ------------------------- | -------------------------------------------------------------------- |
| HTML         | Prebuilt static templates | Server replaces `{{{content}}}` placeholder in layout.html           |
| AJAX         | htmx 2.x                  | Partial page updates, form submission, server-driven UI              |
| Client state | Alpine.js 3.x             | Modals, toasts, local UI toggles (not data state)                    |
| Styling      | Hand-authored CSS         | 3 files: theme.css, app.css, gallery.css. No framework. |
| Icons        | Unicode / SVG             | No icon library dependency. Inline SVGs where needed.                |

## Development Workflow

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- No npm/yarn required

### Starting Development

```bash
# Start web server (hot reload via --watch)
bun run dev

# → Server at http://localhost:3000
# → Source TS files served directly (no compilation)
```

No frontend build step needed during development — Bun serves TypeScript directly.

### Production Build

```bash
# Build static assets for browser
bun run build:frontend

# Output to: ./dist/public/
```

## Build Scripts

| Command                  | Purpose                               |
| ------------------------ | ------------------------------------- |
| `bun run dev`            | Start development server (hot reload) |
| `bun run start`          | Start production server               |
| `bun run build`          | Build all assets (frontend + server)  |
| `bun run build:frontend` | Build browser bundle only             |
| `bun run build:server`   | Build server bundle only              |

## TypeScript Support

### Server-side TypeScript

Configured via `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

### Browser-side TypeScript

Configured via `tsconfig.frontend.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["src/frontend/**/*"]
}
```

Key differences:

- Includes DOM lib for browser APIs
- No Bun types (runs in browser)
- Empty `types` array to avoid Node.js polyfills

### Type Checking

```bash
# Server-side
bun run typecheck

# Frontend (browser bundle)
bun run typecheck:frontend
```

## Asset Pipeline

### Build Output

The build produces `dist/public/` (static assets — `index.html`, `style.css`, `browser.js` for bundled frontend TypeScript) and `dist/server.js` (bundled server TypeScript).

### Pre-compression

All HTML, CSS, and JS files get pre-compressed at build time:

```
dist/public/
  index.html
  index.html.gz        # gzip
  index.html.br        # brotli
  style.css
  style.css.gz
  style.css.br
  browser.js
  browser.js.gz
  browser.js.br
```

Server checks `Accept-Encoding` and serves compressed variant directly.

## Source Structure

The `src/frontend/` directory contains `index.ts` (public exports for browser bundle), `browser.ts` (browser-compatible crypto/compression utilities), and additional frontend modules.

## CSS Architecture

No Tailwind. No CSS-in-JS. Three files:

1. **theme.css** — CSS custom properties (design tokens), global resets
2. **app.css** — Layout system, component classes
3. **gallery.css** — Asset gallery components

### Design Tokens

All design tokens are CSS custom properties in `theme.css`:

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

The `src/frontend/browser.ts` module provides browser-compatible implementations:

- **Compression**: gzip, brotli (zstd planned)
- **Encryption**: AES-256-GCM via WebCrypto API
- **Encoding**: Base64 utilities

Used for client-side message encryption/decryption.

## Documentation Index

| File                                                | Pages covered                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| [overview.md](./frontend/overview.md)               | Design principles, CSS tokens, tech stack                          |
| [routing.md](./frontend/routing.md)                 | URL structure, navigation patterns, htmx history                   |
| [chat/overview.md](./frontend/chat/overview.md)     | Chat types, data model, message tree, chat master, world/location  |
| [chat/layout.md](./frontend/chat/layout.md)         | Hamburger sidebar, centered configurable width, panels, responsive |
| [chat/messages.md](./frontend/chat/messages.md)     | Markdown render, message bubbles, detail levels, tooling, swipe    |
| [chat/generation.md](./frontend/chat/generation.md) | Typing indicator, streaming, error handling                        |
| [characters.md](./frontend/characters.md)           | Character list grid, create/edit form                              |
| [gallery.md](./frontend/gallery.md)                 | Asset gallery grid, preview modal, upload dialog                   |
| [settings.md](./frontend/settings.md)               | Settings sections: general, chat, API config                       |
| [components.md](./frontend/components.md)           | Shared components: toasts, modals, spinners, chips, drop zones     |
| [full list →](./frontend/)                          | All frontend UX specifications                                     |

## Related Documentation

- [Build & Deployment](./spec/build-deploy.md) — Full build pipeline details
- [Implementation](./spec/implementation.md) — Tech stack and module overview
- [Assets](./spec/assets.md) — Asset upload and linking system
