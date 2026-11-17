<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Installation

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Git
- SQLite3 (local dev)

## Quick Start

### macOS / Linux

Server at `http://localhost:3000`

```bash
git clone <repository-url>
cd loop-lore
bun install
bun run db:migrate
bun run dev
```

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
| `bun run format`       | Check formatting with dprint (`format:fix` to write) |
| `bun run docs:dev`     | Start documentation dev server     |
| `bun run docs:build`   | Build documentation for production |
| `bun run docs:preview` | Preview built documentation        |
| `bun run mermaid:lint` | Validate mermaid diagram blocks in docs |

## Environment

Create `.env` in root:

```
DB_TYPE=sqlite
PORT=3000
HOST=localhost
ENABLE_TUI=true
ENABLE_ASSISTANT=true
DOCS_ENABLED=true
```

Runtime state (SQLite database, uploads, TLS certs) lives outside the repo, under
the XDG state dir — one directory per instance. The database path is chosen by
environment variables, not config keys — put them in `.env` (or the shell):

- `LOOP_LORE_DB_PATH` — absolute path of the SQLite file; wins over the per-instance default.
- `LOOP_LORE_STATE_DIR` — the state root; wins over `$XDG_STATE_HOME/loop-lore`.
- `XDG_STATE_HOME` — XDG base directory; `loop-lore` is appended to it.

`config.db.sqliteFilename` is ignored at runtime: the server resolves the database
path from `LOOP_LORE_DB_PATH` or the per-instance state dir. See
[state and instances](./state-and-instances.md).

## Docker

Container image at repo-root `Dockerfile` (multi-stage); full stack (Caddy TLS + app + Postgres) in `deploy/docker-compose.yml`. See [`spec/build-deploy.md`](../spec/build-deploy.md).

```bash
docker build -t loop-lore:latest .
```

## First boot

A fresh clone with no env vars boots directly: when `NODE_ENV` is unset
(prod-like) and no config file exists, the server generates PII secrets
(`nsfw.piiSecret`, `nsfw.reporterHashSecret`,
`observability.telemetry.piiSecret`) into gitignored `config.local.yaml`
(chmod 0600) instead of failing. Deleting that file restores fresh-clone
behavior. Remaining setup (providers, encryption, model roles, TLS) is
reported machine-readably at `GET /api/v1/setup/state` (admin-gated).

## Verification

1. Web UI at `http://localhost:3000`
2. TUI via `bun run tui` in separate terminal
3. Docs at `http://localhost:3000/docs/`
4. API endpoints responding
