<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Build & Deployment

## Philosophy: Minimum-Build Strive

The application aims to be:

1. **Easy to start locally** — one command, zero config for solo use
2. **Easy to distribute** — minimal dependencies, self-contained
3. **Easy to deploy** — same codebase works for solo and multi-user

## Local Development Setup

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- Git

### Quick Start (Solo/Demo)

That's it. No Docker, no Postgres, no build step. SQLite file created automatically.

### Available Scripts

| Command              | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `bun run dev`        | Start dev server (hot reload via --watch) |
| `bun run start`      | Start production server                   |
| `bun run tui`        | Start TUI interface                       |
| `bun run build`      | Build static assets + pre-compress        |
| `bun run db:migrate` | Run pending database migrations           |
| `bun run db:reset`   | Drop and recreate DB (dev only)           |
| `bun run lint`       | Lint TypeScript source                    |
| `bun run format`     | Format code with Prettier                 |

## Build Process

### What Gets Built

The build process maps source to distribution in three steps:

1. **HTML templates** — `src/views/` files are preprocessed and written to `dist/public/`
2. **Static assets** — `src/public/` files are copied to `dist/public/`
3. **Server bundle** — `src/server.ts` is bundled via `bun build --target bun` → `dist/server.js`

### Build Command

```bash
bun run build
```

Steps:

1. Copy/process HTML templates from `src/views/` to `dist/public/`
2. Copy static assets from `src/public/` to `dist/public/`
3. Pre-compress HTML/CSS/JS with gzip and brotli
4. Bundle server with `bun build --target bun`

### No-Build Dev Mode

In development, `bun run dev` serves:

- Source TS files directly (Bun runs without compilation)
- HTML templates from `src/views/` (no preprocessing)
- Static assets from `src/public/`

No watch/rebuild step needed for frontend assets — Bun's `--watch` restarts on server changes.

## Static Asset Pre-compression

All HTML, CSS, and JS files get compressed at build time. For each source file (e.g., `index.html`, `style.css`), three variants are produced in `dist/public/`:

1. Original — `index.html`
2. Gzip — `index.html.gz`
3. Brotli — `index.html.br`

Server checks `Accept-Encoding` header and serves the compressed variant directly (no on-the-fly compression).

Server checks `Accept-Encoding` and serves compressed variant directly (no on-the-fly compression).

## Distributed Deployment

### Option A: Single binary (simplest)

Single binary with embedded SQLite. No deps needed. Works on any Linux x64.

### Option B: Docker container

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install && bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["bun", "run", "dist/server.js"]
```

### Option C: Reverse proxy (multi-user production)

Production topology with three tiers:

1. **Caddy** (automatic HTTPS via ACME, static cache, rate limiting, load balancing) receives client traffic
2. **Bun** (dynamic API routes, session management, WebSocket connections) processes application logic
3. **Postgres** (persistent data, concurrent writes, cross-session consistency) stores all state

Caddy handles (see `deploy/Caddyfile` + `deploy/docker-compose.yml`):

- TLS termination with automatic issuance + renewal (no certbot, no cron)
- Static file serving (cached)
- Rate limiting
- Load balancing (multiple Bun workers)

Required app env behind Caddy: `SERVER_TRUST_PROXY=1` (honor
`X-Forwarded-*`) and `SERVER_PUBLIC_ORIGIN=https://<domain>` (public
origin for federation nodeinfo + self-referential URLs). For trusted local
HTTPS use `deploy/Caddyfile.local` (`tls internal`, one-time
`caddy trust`).

Bun handles:

- Dynamic API routes
- Session management
- WebSocket connections

Postgres handles:

- Persistent data
- Concurrent writes
- Cross-session consistency

## Environment Configuration

See [`docs/spec/config-file-separation.md`](./config-file-separation.md) for full env reference.

## Documentation Hosting

The docs site is a VitePress build (`base: '/docs/'`) with mermaid
diagram rendering wired in:

| Command | Purpose |
| --- | --- |
| `bun run docs:dev` | VitePress dev server (hot reload) |
| `bun run docs:build` | Build static site to `docs/.vitepress/dist/` |
| `bun run docs:preview` | Preview the built site locally |
| `bun run mermaid:lint` | Parse-validate mermaid fence blocks in `docs/` and `.plan/` |

Mermaid fence blocks render client-side via
`vitepress-plugin-mermaid` + `vitepress-mermaid-renderer`; the parse gate
(`mermaid:lint`) also runs in `scripts/check-parallel.mjs` and in the
GitHub Pages deploy workflow.

### GitHub Pages

`.github/workflows/deploy.yml` deploys the built site to GitHub Pages on
every push to `dev` (and via `workflow_dispatch`): install deps →
`mermaid:lint` → `docs:build` → `actions/deploy-pages@v4`. Requires the
repo setting **Settings → Pages → Source: GitHub Actions** (first deploy
fails until that toggle is flipped).

### App-served docs (optional, separate)

- `/docs/*` routes can also be served by the application itself from the
  prebuilt `docs/.vitepress/dist/` directory
- Disabled with `DOCS_ENABLED=false`
- Sections can be individually hidden via config (e.g., hide internal
  architecture docs from public)

## Docker Compose (Production Template)

Canonical file: `deploy/docker-compose.yml` (Caddy + app + Postgres).
Start with:

```bash
DOMAIN=lore.example.com ACME_EMAIL=admin@example.com \
  POSTGRES_PASSWORD=<secret> docker compose -f deploy/docker-compose.yml up -d
```

## Platform Support

See [`platform-support.md`](./platform-support.md) for Windows, Android (Termux), and cross-platform compatibility notes.
