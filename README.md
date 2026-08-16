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

loop-lore aims to rebuild the core — characters, chats, lorebooks, multi-backend
LLM — on a sane architecture:

- **TypeScript + Bun** — no compilation step, fast runtime
- **Database-backed** — `bun:sqlite` local, PostgreSQL remote (Kysely query
  builder)
- **TUI mode** — blessed-based terminal interface (no browser needed)
- **Web UI** — htmx + Alpine.js (lightweight, no build step)
- **Assets** — images/audio/video linked polymorphically to any entity
- **Assistant** — user-focused help (ideas, suggestions, troubleshooting)
- **Clean code** — small files, strict types, no 12K-line monoliths

---

## Features

| Feature                | Status  | Notes                                                          |
| ---------------------- | ------- | -------------------------------------------------------------- |
| Character management   | WIP     | PNG card import/export (V2/V3), JSON, TOML, YAML               |
| Chat engine            | WIP     | Multi-backend LLM, streaming, swipe, transitions               |
| TUI chat interface     | WIP     | Blessed-based, keyboard-driven                                 |
| Database layer         | WIP     | bun:sqlite + Kysely (type-safe, dialect-swappable)             |
| Assets (media)         | WIP     | Images/audio/video, polymorphic linking, metadata extraction   |
| Assistant chat         | MVP     | Rule-based, context-aware suggestions, dice, music commands    |
| VN scene generation    | WIP     | Choice cards, scene templates, transition triggers             |
| Emotion avatars        | WIP     | Multi-provider text2img (openai, sdapi, sdcpp, comfyui)        |
| Regex extraction       | WIP     | Image edits, intents, memory, transitions, hallucination guard |
| RPG systems            | WIP     | Combat, quests, skills, loot, XP, dice, NPC navigation         |
| Lorebooks / World Info | Planned | Sticky/cooldown/delay entries                                  |
| Web UI                 | WIP     | htmx + Alpine.js, VN renderer, chat UI                         |
| Plugin system          | WIP     | Server plugins + client extensions                             |
| Crypto / Encryption    | WIP     | Actor keys, chat keys, BYOK, SMK, at-rest encryption           |
| Multi-session          | WIP     | Solo user mode, session management                             |
| I18n                   | WIP     | Internationalization with locale loading                       |
| Memory                 | WIP     | Budget, provisioning, purge, shareability                      |
| Telemetry              | WIP     | Event tracking                                                 |
| Profanity filter       | WIP     | Text filtering service                                         |
| Age gate               | WIP     | Age verification service                                       |
| Notifications          | WIP     | Notification service                                           |

---

## Architecture

```
src/
├── elysia-app.ts      Elysia setup + route registration
├── server/            HTTP entry (handler, index, start, static-files)
├── db/                Kysely init + schema types + migrations
├── config/            Config loading + hot-reload + templates
├── routes/            REST API endpoints (100+ route files)
├── app/              Plugin registration (register-plugins.ts)
├── assets/            Asset service + metadata extraction
├── assistant/         Assistant service + commands (dice, music)
├── characters/        Character services (avatar, mood, traits)
├── chat/              Chat engine (hallucination guard, transitions)
├── content/           Hash injection, compression, encoding
├── crypto/            Encryption (actor keys, BYOK, SMK, at-rest)
├── eslint-rules/      Custom ESLint rules (param-limit)
├── frontend/          htmx + Alpine.js + VN renderer
├── generation/        LLM generation (multi-provider, streaming)
├── memory/            Memory budget, provisioning, purge
├── middleware/         Auth, NSFW gate, solo user, rate limit
├── plugins/           Plugin registry + hooks
├── public/            Static assets served at / (CSS, locales, img)
├── regex/             Extraction pipeline (image edits, intents, etc.)
├── rpg/               RPG subsystems (combat, quests, skills, loot)
├── routes/            REST handlers
├── scripts/           Build scripts (commit-check, smoke-app, version-bump)
├── story/             Multi-LLM story engine
├── transport/         WebSocket transport layer (aspirational)
├── turning/           Turn orchestration
├── tui/               Terminal UI (blessed)
├── validation/        Elysia t (TypeBox) schemas + middleware
└── utils/             Shared utilities
```

**Key decisions:**

- Kysely query builder — type-safe, dialect-swappable (bun:sqlite ↔ postgres),
  no ORM overhead
- No god-object modules — each file <200 lines preferred
- Event bus for cross-module communication (learned from SillyTavern's event
  system)
- Provider registry for LLM backends

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

---

## Documentation

- `docs/spec/` — Core specs (106 files)
- `docs/frontend/` — UX specs (17 files)
- `docs/guide/` — User guides
- `docs/reference/` — Reference documentation
- `docs/ideas/` — Design ideas and proposals
- `docs/meta/code-practices-improvements/*` — Code practices research
- `docs/meta/pattern-divergence.md` — Quantified divergence audit
- `docs/meta/` — Research, assessments, reviews, workflow
- `docs/public/` — Public-facing docs
- `docs/i18n/` — Localized README translations
- `.plan/` — Task tracking (source of truth for active work)
- `.agents/references/` — Coding conventions (banned patterns, recommendations)
- `AGENTS.md` — Agent instructions and project overview

---

## License

LGPL-3.0-or-later (core code), MIT (docs), Apache-2.0 OR MIT (plugins)\
See [LICENSE](./LICENSE) and [LICENSES/](./LICENSES/) for full texts.
