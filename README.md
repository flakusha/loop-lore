<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# loop-lore

[![EN](https://img.shields.io/badge/EN-blue)](README.md)
[![中文](https://img.shields.io/badge/中文-blue)](docs/i18n/README.zh.md)
[![Español](https://img.shields.io/badge/Español-blue)](docs/i18n/README.es.md)

**LLM RPG Chat And More.**

Inspired by:

- [SillyTavern](https://github.com/SillyTavern/SillyTavern).
- [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus)
- [Open WebUI](https://github.com/open-webui/open-webui).

loop-lore rebuilds the core — characters, chats, lorebooks, multi-backend
LLM — on a sane foundation:

- **TypeScript + Bun** — no compilation step, fast runtime
- **Database-backed** — `bun:sqlite` local, PostgreSQL remote (Kysely query
  builder)
- **TUI mode** — blessed-based terminal interface (no browser needed)
- **Web UI** — htmx + Alpine.js (lightweight, no build step)
- **Assets** — images/audio/video linked polymorphically to any entity
- **Assistant** — user-focused help (ideas, suggestions, troubleshooting)
- **Clean code** — small files, strict types, no 12K-line monoliths

See [`docs/spec/architecture.md`](docs/spec/architecture.md) for the system
layers, design principles, and key decisions. The authoritative source for
project structure is `src/` and [`AGENTS.md`](AGENTS.md) — directory
listings in this README would go stale within days.

---

## Features

Status legend: **MVP** = shipped, **WIP** = active, **Planned** = scoped
but not started. Spec links go to [`docs/spec/`](docs/spec/) and
[`docs/frontend/`](docs/frontend/); epic progress lives in
[`.plan/epics-index.md`](.plan/epics-index.md) and active work in
[`.plan/backlog/open.md`](.plan/backlog/open.md).

| Feature                | Status  | Reference                                                                                                                                            |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Character management   | WIP     | [spec/character-spec](docs/spec/character-spec.md), [frontend/characters](docs/frontend/characters.md)                                               |
| Chat engine            | WIP     | [spec/messages](docs/spec/messages.md), [frontend/chat](docs/frontend/chat/overview.md)                                                              |
| TUI chat interface     | WIP     | [spec/terminal-ui](docs/spec/terminal-ui.md), [guide/getting-started](docs/guide/getting-started.md)                                                 |
| Database layer         | WIP     | [spec/schema](docs/spec/schema.md), [spec/db-versioning](docs/spec/db-versioning.md)                                                                 |
| Assets (media)         | WIP     | [spec/assets](docs/spec/assets.md), [frontend/gallery](docs/frontend/gallery.md)                                                                     |
| Assistant chat         | MVP     | [spec/assistant-commands](docs/spec/assistant-commands.md), [frontend/chat/assistant](docs/frontend/chat/assistant.md)                               |
| VN scene generation    | WIP     | [spec/visual-novel](docs/spec/visual-novel.md), [frontend/chat/visual-novel-mode](docs/frontend/chat/visual-novel-mode.md)                           |
| Emotion avatars        | WIP     | _spec pending — tracked in `.plan/`_                                                                                                                 |
| Regex extraction       | WIP     | _spec pending — see `src/regex/`_                                                                                                                    |
| RPG systems            | WIP     | [spec/rpg-mechanics](docs/spec/rpg-mechanics.md), [spec/achievements](docs/spec/achievements.md)                                                     |
| Lorebooks / World Info | Planned | [spec/lore](docs/spec/lore.md), [frontend/worlds](docs/frontend/worlds.md)                                                                           |
| Web UI                 | WIP     | [frontend/component-architecture](docs/frontend/component-architecture.md)                                                                           |
| Plugin system          | WIP     | [spec/plugin-system](docs/spec/plugin-system.md)                                                                                                     |
| Crypto / Encryption    | WIP     | [spec/crypto](docs/spec/crypto.md), [spec/encryption-workflow](docs/spec/encryption-workflow.md), [frontend/encryption](docs/frontend/encryption.md) |
| Multi-session          | WIP     | [spec/users-sessions](docs/spec/users-sessions.md)                                                                                                   |
| I18n                   | WIP     | [frontend/internationalization](docs/frontend/internationalization.md), [docs/i18n](docs/i18n/)                                                      |
| Memory                 | WIP     | [spec/memory-system](docs/spec/memory-system.md), [frontend/chat/memories](docs/frontend/chat/memories.md)                                           |
| Telemetry              | WIP     | [spec/observability-telemetry](docs/spec/observability-telemetry.md)                                                                                 |
| Profanity filter       | WIP     | _spec pending — see `src/profanity/`_                                                                                                                |
| Age gate               | WIP     | [frontend/age-gate](docs/frontend/age-gate.md)                                                                                                       |
| Notifications          | WIP     | [frontend/notifications](docs/frontend/notifications.md)                                                                                             |

---

## Tech Stack

| Layer         | Choice                                          |
| ------------- | ----------------------------------------------- |
| Runtime       | Bun (fast TS/JS, no build step)                 |
| Language      | TypeScript 5.4+ (strict mode)                   |
| Database      | `bun:sqlite` → Postgres via Kysely dialect swap |
| Query Builder | Kysely (type-safe, no ORM overhead)             |
| TUI           | blessed + blessed-contrib                       |
| Web UI        | htmx + Alpine.js                                |

Architecture decisions and tradeoffs live in
[`docs/spec/architecture.md`](docs/spec/architecture.md). Coding conventions
are in [`.agents/references/`](.agents/references/).

---

## Quick Start

```bash
# Prerequisites: Bun (https://bun.sh)
bun install
cp .env.example .env
bun run db:migrate

# Start web server
bun run dev

# Start TUI (separate terminal)
bun run tui

# Run all checks (typecheck + lint + format)
bun run check

# Run tests
bun test src/
```

Full guide: [`docs/guide/getting-started.md`](docs/guide/getting-started.md).

---

## Documentation

- [`docs/spec/`](docs/spec/) — Core specs (architecture, characters, chat,
  RPG, encryption, telemetry, …)
- [`docs/frontend/`](docs/frontend/) — UX specs (components, chat, gallery,
  characters, …)
- [`docs/guide/`](docs/guide/) — User guides (installation, first chat,
  gallery, characters, worlds, personas, settings)
- [`docs/reference/`](docs/reference/) — Reference docs (API surface)
- [`docs/ideas/`](docs/ideas/) — Design ideas and proposals
- [`docs/meta/`](docs/meta/) — Research, assessments, reviews, workflow
- [`docs/i18n/`](docs/i18n/) — Localized README translations
- [`.plan/`](.plan/) — Task tracking (source of truth for active work)
- [`.agents/references/`](.agents/references/) — Coding conventions
  (banned patterns, recommendations)
- [`AGENTS.md`](AGENTS.md) — Agent instructions and project overview

---

## License

LGPL-3.0-or-later (core code), MIT (docs), Apache-2.0 OR MIT (plugins)\
See [LICENSE](./LICENSE) and [LICENSES/](./LICENSES/) for full texts.
