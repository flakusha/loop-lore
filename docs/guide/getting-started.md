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
| `bun run mermaid:lint` | Validate mermaid diagram blocks in docs |

## lolo CLI

`lolo` is the CLI entry point (headless subcommands plus TUI fallback). From a
checkout, `bun run lolo` works without installation. Bare `lolo` needs a link
on PATH:

```bash
mkdir -p ~/.local/bin && ln -s "$PWD/bin/lolo.ts" ~/.local/bin/lolo
```

Windows has no `~/.local/bin` — use `bun run lolo`, or link from
`%USERPROFILE%\.local\bin`. The link needs `bun` on PATH and points at the
checkout, so it follows that checkout's git HEAD.

| Command | Description |
| --- | --- |
| `lolo` | Launch the TUI (no subcommand) |
| `lolo chat create --name N` | Create a chat |
| `lolo generate --chat-id C --parent P --actor A` | Generate a reply |
| `lolo assets upload <file>` | Upload an asset |
| `lolo characters import <card>` | Import a character card |

`lolo --help` prints the full headless command list.
