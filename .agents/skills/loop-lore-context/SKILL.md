---
name: loop-lore-context
description: >
  Use when working on loop-lore (SillyTavern clean reimplementation).
  Provides project overview, architecture, technology constraints, directory
  layout, coding conventions, and quick-reference commands.
version: 1.0.0
author: loop-lore contributors
license: Apache-2.0 OR MIT
metadata:
  agents:
    tags: [loop-lore, sillytavern, rpg-chat, bun, typescript]
    related_skills: [loop-lore-db, loop-lore-tasks]
---

# Loop-Lore Project Context

LLM RPG Chat reimplementation inspired by SillyTavern, Odysseus, and Open
WebUI. Built on TypeScript + Bun with dual TUI/Web UI.

## Technology Constraints

| Layer    | Required                                                    |
| -------- | ----------------------------------------------------------- |
| Runtime  | Bun (no compilation step, `bun run` directly)               |
| Language | TypeScript 5.4+ strict mode                                 |
| Database | `bun:sqlite` native + Kysely; Kysely PostgresDialect for PG |
| TUI      | blessed + blessed-contrib                                   |
| Web      | htmx + Alpine.js (no React/Vue/Svelte)                      |

## Directory Layout

```
src/
├── server.ts              HTTP entry
├── db/                    DB layer (Kysely init, schema types, enums, migrations)
├── config/                Configuration loading (file + env override)
├── routes/                REST handlers under /api/
├── assets/                Media CRUD, upload, polymorphic linking
├── assistant/             Rule-based help system
├── generation/            LLM generation (types, cancellation, pipeline, detection)
├── story/                 Multi-LLM story engine
├── content/               Encoding/minification/compression
├── age-gate/              Age verification
├── tui/                   Blessed widgets (app, chat, gallery, input)
├── middleware/            Auth, session, error handling
├── transport/             WebSocket/SSE streaming
├── utils/                 Shared utilities
├── logger/                Logging setup
├── public/                Static assets for web UI
├── views/                 Htmx templates (if server-rendered web UI)
data/                      Runtime SQLite DB, uploaded assets
docs/                      Specs, architecture, data model, UX spec
```

## Coding Conventions

- **Types**: Interfaces > types; enums for fixed sets; strict mode
- **Files**: One class/feature per file; <200 lines preferred; `index.ts` exports public API
- **Naming**: camelCase vars/fns, PascalCase classes, UPPER_SNAKE_CASE constants, no `I` prefix
- **Async**: Always handle promises (await or .catch()); no bare `.then()` waterfalls
- **JSDoc**: All public exports — @param, @returns, @throws, @example
- **Imports**: Never import DB-specific modules in services/controllers (use Kysely types + db instance)

## Quick-Reference Commands

```bash
bun run src/server.ts        # Start dev server
bun run src/tui/app.ts       # Start TUI
bun run typecheck            # tsc --noEmit
bun run lint                 # ESLint
bun run lint:fix             # ESLint auto-fix
bun run format               # Prettier check
bun run format:fix           # Prettier write
bun run md:lint              # Markdownlint docs/
bun run check                # typecheck + lint + format + md:lint
bun test                     # Run tests (Jest-compatible API)
bun test --coverage          # Coverage report
bun run db:migrate           # Run DB migrations
```

## Key Design Decisions

- **DB-native bun:sqlite** — no better-sqlite3, no custom adapter layer
- **Kysely** for type-safe queries, schema types, migrations (`kysely/bun-sqlite` dialect)
- **Polymorphic asset linking** — images/audio/video linkable to any entity via `asset_links` table
- **Rule-based assistant** — MVP in `src/assistant/service.ts`, designed for swap to LLM backend
- **Session token auth** — JWT or server-side token lookup
- **No commit of .env** — use `.env.example` only

## Docs to Read First

Before touching any feature, read the relevant spec in `docs/`:

| Feature              | Doc File                          |
| -------------------- | --------------------------------- |
| DB schema (all)      | `docs/schema.md`                  |
| Messages             | `docs/messages.md`                |
| Users/sessions       | `docs/users-sessions.md`          |
| Assets               | `docs/assets.md`                  |
| Actors               | `docs/actors.md`                  |
| Characters/persona   | `docs/character-setup.md`         |
| RPG mechanics        | `docs/rpg-mechanics.md`           |
| Architecture         | `docs/architecture.md`            |
| Build/deploy         | `docs/build-deploy.md`            |
| Implementation       | `docs/implementation.md`          |
| TUI                  | `docs/tui.md`                     |
| Plugin system        | `docs/plugin-system.md`           |
| Memory system        | `docs/memory-system.md`           |
| Artifacts system     | `docs/artifacts-system.md`        |
| Plan / tasks         | `docs/plan.md`                    |
| Frontend UX          | `docs/frontend/overview.md`       |

## Common Pitfalls

1. **Forgetting `screen.render()` after TUI updates.** Blessed requires manual re-render.
2. **Importing DB-specific modules in services/controllers.** Use Kysely types + db instance only.
3. **Bare `.then()` waterfalls.** Always await or .catch().
4. **Skipping doc reading.** Always read relevant `docs/` before implementing.
5. **Pushing without `bun run check`.** Run typecheck + lint + format + md:lint first.