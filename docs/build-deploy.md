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

```bash
git clone <repo> && cd loop-lore
bun install
bun run dev
# → Server at http://localhost:3000
# → Demo mode auto-enabled (no auth, sample data created)
```

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

```
src/
  views/        → Preprocessed HTML → dist/public/
  public/       → Static assets      → dist/public/  (copied)
  server.ts     → Bun bundle         → dist/server.js
```

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

All HTML, CSS, and JS files get compressed at build time:

```
dist/public/
  index.html
  index.html.gz        # gzip
  index.html.br        # brotli
  style.css
  style.css.gz
  style.css.br
```

Server checks `Accept-Encoding` and serves compressed variant directly (no on-the-fly compression).

## Distributed Deployment

### Option A: Single binary (simplest)

```bash
bun build src/server.ts --compile --outfile loop-lore
./loop-lore
```

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

```bash
docker build -t loop-lore .
docker run -p 3000:3000 -v ./loop-lore-data:/app/loop-lore-data \
  -e SQLITE_FILENAME=loop-lore-data/loop-lore.db \
  loop-lore
```

### Option C: Reverse proxy (multi-user production)

```
Client → nginx (TLS, static cache) → Bun (app) → Postgres
```

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
