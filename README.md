# loop-lore

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

| Feature                | Status  | Notes                                              |
| ---------------------- | ------- | -------------------------------------------------- |
| Character management   | Planned | PNG card import/export (V2/V3), JSON               |
| Chat engine            | WIP     | Multi-backend LLM, streaming, swipe                |
| TUI chat interface     | WIP     | Blessed-based, keyboard-driven                     |
| Database layer         | WIP     | bun:sqlite + Kysely (type-safe, dialect-swappable) |
| Assets (media)         | Planned | Images/audio/video, polymorphic linking            |
| Assistant chat         | MVP     | Rule-based, context-aware suggestions              |
| Lorebooks / World Info | Planned | Sticky/cooldown/delay entries                      |
| Web UI                 | Planned | htmx + Alpine.js                                   |
| Plugin system          | Planned | Server plugins + client extensions                 |

---

## Architecture

```
src/
├── server.ts          Bun HTTP entry point
├── db/                Kysely init + schema types
│   ├── schema.ts      Table type definitions
│   ├── migrations/    Kysely Migrator files
│   └── index.ts       Kysely init + exports (bun:sqlite / postgres dialect)
├── routes/            REST API endpoints
├── assets/            Asset service + controller (replaces gallery)
├── assistant/         Assistant service + controller
├── tui/               Terminal UI (blessed)
└── ...
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
```

---

## Documentation

- `docs/implementation.md` — Full tech details, API reference, env vars
- `docs/schema.md` — Database schema and migrations
- `docs/assets.md` — Asset system (replaces gallery)
- `docs/tui.md` — TUI architecture and keyboard shortcuts
- `docs/architecture.md` — System layers and request flow
- `docs/frontend.md` — htmx + Alpine.js frontend
- `docs/users-sessions.md` — User roles and session management
- `docs/messages.md` — Message system and detail levels
- `docs/build-deploy.md` — Build and deployment
- `docs/roadmap.md` — Future features and improvements

---

## License

LGPL-3.0-or-later (core code), MIT (docs), Apache-2.0 OR MIT (plugins)\
See [LICENSE](./LICENSE) and [LICENSES/](./LICENSES/) for full texts.
