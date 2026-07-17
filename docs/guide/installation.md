# Installation

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Git
- SQLite3 (local dev)

## Quick Start

### macOS / Linux

Server at `http://localhost:3000`

### Windows

TUI requires Windows Terminal or WSL. PowerShell/CMD unsupported.

```powershell
git clone <repository-url>
cd loop-lore
bun install
bun run db:migrate
bun run dev
```

**Windows considerations:** OpenSSL needed for TLS cert auto-gen. Binary paths (`llama-server.exe`, `sd-server.exe`) must be in system PATH for auto-start features.

## Scripts

| Command                | Description                        |
| ---------------------- | ---------------------------------- |
| `bun run dev`          | Start dev server (hot reload)      |
| `bun run start`        | Start production server            |
| `bun run tui`          | Start TUI interface                |
| `bun run build`        | Build static assets for production |
| `bun run db:migrate`   | Run pending migrations             |
| `bun run lint`         | Run ESLint                         |
| `bun run format`       | Format code with Prettier          |
| `bun run docs:dev`     | Start documentation dev server     |
| `bun run docs:build`   | Build documentation for production |
| `bun run docs:preview` | Preview built documentation        |

## Environment

Create `.env` in root:

```
DB_TYPE=sqlite
SQLITE_FILENAME=../loop-lore-data/loop-lore.db
PORT=3000
HOST=localhost
ENABLE_TUI=true
ENABLE_ASSISTANT=true
DOCS_ENABLED=true
ASSET_STORAGE_BACKEND=local
```

## Docker

No `Dockerfile` exists yet. Instructions aspirational.

## Verification

1. Web UI at `http://localhost:3000`
2. TUI via `bun run tui` in separate terminal
3. Docs at `http://localhost:3000/docs/`
4. API endpoints responding
