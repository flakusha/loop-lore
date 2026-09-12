<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

[![EN](https://img.shields.io/badge/EN-blue)](README.md)
[![中文](https://img.shields.io/badge/中文-blue)](docs/i18n/README.zh.md)
[![Español](https://img.shields.io/badge/Español-blue)](docs/i18n/README.es.md)
[![日本語](https://img.shields.io/badge/日本語-blue)](docs/i18n/README.ja.md)
[![한국어](https://img.shields.io/badge/한국어-blue)](docs/i18n/README.ko.md)
[![Русский](https://img.shields.io/badge/Русский-blue)](docs/i18n/README.ru.md)
[![Français](https://img.shields.io/badge/Français-blue)](docs/i18n/README.fr.md)

# loop-lore

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

Feature status lives in [`.plan/epics-index.md`](.plan/epics-index.md) and
active work in [`.plan/backlog/open.md`](.plan/backlog/open.md) — statuses
are not duplicated here.

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

- [`docs/README.md`](docs/README.md) — Documentation hub (philosophy, RPG
  status, full index)
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
