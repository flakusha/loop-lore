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

1. **nginx** (TLS termination, static cache, rate limiting, load balancing) receives client traffic
2. **Bun** (dynamic API routes, session management, WebSocket connections) processes application logic
3. **Postgres** (persistent data, concurrent writes, cross-session consistency) stores all state

nginx handles:

- SSL termination
- Static file serving (cached)
- Rate limiting
- Load balancing (multiple Bun workers)

Bun handles:

- Dynamic API routes
- Session management
- WebSocket connections

Postgres handles:

- Persistent data
- Concurrent writes
- Cross-session consistency

## Environment Configuration

See [`docs/configuration.md`](./configuration.md) for full env reference.

## Documentation Hosting

- `/docs/*` routes served from `docs/` directory
- Disabled with `DOCS_ENABLED=false`
- Sections can be individually hidden via config (e.g., hide internal architecture docs from public)
- VitePress/SSG optional; plain Markdown served as default

## Docker Compose (Production Template)

```yaml
version: "3.8"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DB_TYPE=postgres
      - DATABASE_URL=postgres://user:pass@db:5432/looplore
      - AUTH_REQUIRED=true
      - DOCS_ENABLED=false
    depends_on:
      - db
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: looplore
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

## Platform Support

See [`platform-support.md`](./platform-support.md) for Windows, Android (Termux), and cross-platform compatibility notes.
