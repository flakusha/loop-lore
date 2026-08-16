<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Getting Started

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Git
- SQLite3 (local dev)

## Quick Start

```bash
git clone <repository-url>
cd loop-lore
bun install
bun run db:migrate
bun run dev
```

Server starts at `http://localhost:3000`.

**Next:** [Your First Chat](/guide/first-chat) — create a character and send
your first message. For full setup details (env vars, Docker, Windows) see
[Installation](/guide/installation).

## Scripts

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `bun run dev`        | Start development server           |
| `bun run start`      | Start production server            |
| `bun run tui`        | Start TUI interface                |
| `bun run build`      | Build static assets                |
| `bun run db:migrate` | Run database migrations            |
| `bun run docs:dev`   | Start documentation dev server     |
| `bun run docs:build` | Build documentation for production |
