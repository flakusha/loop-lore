# AGENTS.md

Instructions for coding agents on loop-lore.

## Reference Material

Deep-dive docs in `/docs/` — read before touching related code:

### Core System

| File                            | Covers                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| `docs/spec/schema.md`           | Full DB schema (all tables: core, generation, story, actors, assets)    |
| `docs/spec/messages.md`         | Message persistence, detail levels, invalid message handling            |
| `docs/spec/users-sessions.md`   | User roles, remote sessions, demo/solo mode                             |
| `docs/spec/assets.md`           | Asset system (images/audio/video), upload pipeline, polymorphic linking |
| `docs/spec/actors.md`           | Actor data model: character cards, memories, lorebooks, inventory       |
| `docs/spec/character-setup.md`  | Character & persona system: multi-format import/export, impersonation   |
| `docs/spec/rpg-mechanics.md`    | RPG mechanics: stats, combat, equipment, dice, skills, XP, loot         |
| `docs/spec/architecture.md`     | System layers, request flow, docs serving                               |
| `docs/spec/build-deploy.md`       | Minimum-build setup, build pipeline, deployment options                 |
| `docs/spec/implementation.md`   | Tech stack, all modules (db, gen, story, assets, assistant, TUI)        |
| `docs/spec/tui.md`              | Blessed component hierarchy, keyboard map, data flow                    |
| `docs/spec/plugin-system.md`    | Plugin architecture: types, lifecycle, security, examples               |
| `docs/spec/memory-system.md`    | Three-tier memory: episodic, semantic, procedural                       |
| `docs/spec/artifacts-system.md` | Code, documents, datasets as polymorphic assets                         |
| `docs/meta/plan.md`             | MVP implementation checklist with week-by-week tasks                    |
| `docs/spec/api-routes.md`       | API route contract — all endpoints, conventions, error envelope         |
| `docs/spec/auth-middleware.md`  | Auth middleware — token flow, session model, role guard, rate limiting  |
| `docs/spec/error-envelope.md`   | Standard error envelope — codes, shapes, patterns, frontend sync        |

### Frontend UX Spec (`docs/frontend/`)

These are the authoritative UX specification files. Read the relevant ones
before building any frontend feature.

| File                                      | Covers                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `docs/frontend/overview.md`               | Design principles, CSS tokens, tech stack, architecture                                                                            |
| `docs/frontend/routing.md`                | URL scheme, navigation patterns, htmx history                                                                                      |
| `docs/frontend/data-states.md`            | Entity state machines (active/archived/purged), cascade rules, storage model                                                       |
| `docs/frontend/chat/overview.md`          | Chat types (User×Character, User×User, User×Assistant), data model, message tree, chat master, world/location                      |
| `docs/frontend/chat/layout.md`            | Hamburger sidebar, centered configurable width, left/right panels, responsive behavior                                             |
| `docs/frontend/chat/messages.md`          | Markdown render, message bubbles, book-like image layout, detail levels, hover tooling, swipe, thinking display, scroll management |
| `docs/frontend/chat/generation.md`        | Typing indicator, streaming, generation status per mode, 3-tier error handling, chat-switch guard, idempotent retries              |
| `docs/frontend/chat/archiving.md`         | Cascade deletion, restore, purge flows                                                                                             |
| `docs/frontend/chat/input.md`             | Text input, media attach, LLM selector, message improvement, image generation                                                      |
| `docs/frontend/chat/memories.md`          | Character/assistant/world memories, memory selection, auto-purge, token budget                                                     |
| `docs/frontend/chat/commands-and-misc.md` | Keyboard shortcuts, states summary, image pipeline, system/narration messages                                                      |
| `docs/frontend/chat/multi-llm-story.md`   | Multi-LLM story generation: GM, turn-taking, quests, quality evaluation, synthetic data                                            |
| `docs/frontend/chat/assistant.md`         | Assistant as GM/Moderator, tool assistance, idea suggestions, text improvement                                                      |
| `docs/frontend/chat/export.md`            | Chat export formats, public sharing, read-only links, story publishing                                                              |
| `docs/frontend/chat/group-chat.md`        | Multi-participant chat, turn order, @mentions, initiative tracking                                                               |
| `docs/frontend/characters.md`             | Character list grid, create/edit form                                                                                              |
| `docs/frontend/gallery.md`                | Asset gallery grid, preview modal, upload dialog                                                                                   |
| `docs/frontend/admin.md`                  | Admin panel: user mgmt, chat mgmt, world permissions, audit log, content review, system config                                      |
| `docs/frontend/settings.md`               | Settings sections: general, chat, API config, theme customization, data management                                                 |
| `docs/frontend/worlds.md`                 | World entity: list, detail, create/edit                                                                                            |
| `docs/frontend/login.md`                  | Login page: auth card, demo mode, error states                                                                                     |
| `docs/frontend/encryption.md`             | User secret keys, AES-256-GCM at-rest message encryption, API key encryption, key hierarchy                                        |
| `docs/frontend/age-gate.md`              | Age verification page, self-declaration flow, redirect behavior                                                                    |
| `docs/frontend/component-architecture.md` | HTMX/Alpine.js boundaries, component lifecycle, state management                                                                   |
| `docs/frontend/headers-management.md`     | Response headers (security/performance), frontend header components, htmx navigation                                               |
| `docs/frontend/internationalization.md`   | UI translation, LLM language selection, actor language preferences, i18n architecture                                           |
| `docs/frontend/components.md`             | Shared components: toasts, modals, spinners, skeletons, empty states, chips, drop zones                                            |
| `docs/frontend/notifications.md`          | Notification system: types, storage, delivery, prompt injection, preferences, lifecycle                                             |
| `docs/frontend/prompt-creation.md`        | Prompt templates, variable injection, actor context, generation tuning                                                               |

---

## Project Overview

Reimplement SillyTavern RPG chat with:

- TUI (blessed) + Web UI (htmx + Alpine.js)
- Database: `bun:sqlite` native → Kysely; swap to PG via Kysely dialect swap
- Assets (images/audio/video, replacing old gallery) — polymorphic linking
- Enhanced assistant (ideas, suggestions, troubleshooting)
- User management with roles and multi-session support
- Lightweight, maintainable codebase

---

## Technology Constraints

| Layer    | Required                                                    |
| -------- | ----------------------------------------------------------- |
| Runtime  | Bun (no compilation step, `bun run` directly)               |
| Language | TypeScript 5.4+ strict mode                                 |
| Database | `bun:sqlite` native + Kysely; Kysely PostgresDialect for PG |
| TUI      | blessed + blessed-contrib                                   |
| Web      | htmx + Alpine.js (no React/Vue/Svelte)                      |

---

## Directory Structure

```
src/
├── server.ts            HTTP entry
├── db/                  DB layer
│   ├── enums.ts         Centralized enum source of truth
│   ├── schema.ts        Kysely table types (all tables)
│   ├── migrations/      Kysely Migrator files
│   └── index.ts         Kysely init + exports (bun:sqlite dialect)
├── config/              Configuration loading (file + env override)
│   ├── schema.ts        Config interface + defaults
│   └── load.ts          File detection, parse, merge, validate
├── routes/              REST handlers
├── assets/              service.ts | controller.ts | types.ts
├── assistant/           service.ts | controller.ts | types.ts
├── generation/          LLM generation: types, cancellation, continuation,
│                        step-pipeline, repetition detection, policy detection
├── story/               Multi-LLM story: turn-manager, types
├── content/             Content encoding (gzip/zstd/brotli), minification, compression
├── age-gate/            Age verification service, controller, tests
├── tui/                 app.ts | chat.ts | gallery-view.ts | input.ts
data/                    Runtime data (SQLite DB, uploaded assets)
docs/                    Specs, architecture, data model
```

---

## Coding Conventions

- **Types**: Interfaces > types; enums for fixed sets; strict mode
- **Files**: One class/feature per file; <200 lines preferred; index.ts exports
  public API
- **Naming**: camelCase vars/fns, PascalCase classes, UPPER_SNAKE_CASE
  constants, no `I` prefix
- **Async**: Always handle promises (await or .catch()); no bare `.then()`
  waterfalls
- **JSDoc**: All public exports — @param, @returns, @throws, @example
- **Imports**: Never import DB-specific modules in services/controllers (use
  Kysely types + db instance)
- **Anti-patterns**: See `.agents/references/banned-patterns.md` — reject in
  review (boolean flags, numeric statuses, `I` prefix, bare `.then()`, `any`,
  silent catches, AI SDK wrappers, CSS-in-JS, `console.*` instead of logger,
  missing ownership checks, `void promise` without `.catch()`)
- **Patterns**: See `.agents/references/recommendations.md` — structured
  logging, input validation checklist, safe JSON IIFE pattern, options-object
  params
- **Docs metrics**: No quantitative metrics in docs — they go stale. Describe
  behavior qualitatively.

---

## Quick Reference

### Code Quality (Linting & Testing)

- **ESLint**: `eslint .` or `bun run lint` — TypeScript strict + unicorn +
  sonarjs + prettier
- **CSS**: `bun run lint:css` — stylelint + `stylelint-config-standard`
  (config: `.stylelintrc.json`); `--fix` variant available
- **HTML**: `bun run lint:html` — markuplint, htmx/Alpine-aware
  (config: `.markuplintrc.json`); runs with `--allow-warnings` so
  structural/a11y errors block CI while a11y-debt warnings surface
  without failing. `--fix` variant available
- **Markdown**: `bun run md:lint` — markdownlint-cli2 on `docs/**/*.md`
- **TypeScript**: `bun run typecheck` — `tsc --noEmit`
- **Type coverage**: `bun run typecheck:coverage` — `type-coverage --strict --at-least 85`
- **All-in-one**: `bun run check` — runs typecheck → typecheck:coverage → lint → lint:css →
  lint:html → format → md:lint
- **Auto-fix**: `bun run lint:fix` (ESLint), `bun run format:fix` (Prettier),
  `bun run md:lint:fix` (markdown)
- **Config files**: `eslint.config.mjs` (flat config), `.prettierrc`,
  `.markdownlint.json`, `.stylelintrc.json`, `.markuplintrc.json`
- **Test**: `bun test` — zero-config, Jest-compatible API
- **Test coverage**: `bun test --coverage`
- **CI**: Always run `bun run check` before pushing. Run `bun test` for
  regression coverage.

### Database

- Native `bun:sqlite` for SQLite — **no** `better-sqlite3`, **no** custom
  adapter layer
- Kysely for type-safe queries, schema types, and migrations
  (`kysely/bun-sqlite` dialect)
- **Migrations are the source of truth** — schema types in `src/db/schema-*.ts`
  should match migration files
- Migrations in `src/db/migrations/`, runnable on startup via Kysely `Migrator`
- See `docs/spec/schema.md` for full table definitions
- v0: migrations consolidated in `001_init.ts` for simplicity

### TUI

- Create widgets as blessed components in `src/tui/`
- Manual `screen.render()` after updates
- Cleanup: restore terminal on exit (process handlers)
- Share state via props/context, not globals
- See `docs/spec/tui.md` for component hierarchy

### API Routes

- Mount under `/api/` — RESTful conventions
- Wrap in try/catch — return proper HTTP codes (200/201/204/400/404/422/500)
- Validate input — query params, body, path params

### Assets (replaces Gallery)

- Service layer in `src/assets/` — CRUD via Kysely
- Controller validates + delegates to service
- Routes: GET/POST/DELETE `/api/assets`, POST/DELETE `/api/assets/:id/link`
- Polymorphic linking via `asset_links` table
- See `docs/spec/assets.md` for full spec

### Assistant

- Rule-based MVP in `src/assistant/service.ts`
- Response shape: `{ type, content, confidence }`
- Designed for swap to LLM backend later
- See `docs/spec/implementation.md` → Enhanced Assistant Chat

### Security

- Parameterized queries (Kysely handles this — always uses bind parameters)
- Validate file paths, sanitize inputs in uploads
- Session token auth middleware (JWT or server-side token lookup)
- No commit of `.env` — use `.env.example` only
- `git push` and any other "send to remote" or "non-local" operations and
  commands are explicitly prohibited unless requested by user

---

## Getting Started for Agents

1. Read relevant `docs/` file for the feature you're working on
2. Check existing code in `src/` for patterns (look at similar implementations)
3. Plan: what files change/create? Tests? Side effects?
4. Implement: follow conventions above
5. Verify: `bun format && bun typecheck && bun run src/server.ts` for server,
   `bun run tui` for TUI

---

## Pre-commit Hooks

Install hooks (one-time):

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

Triggered on `git commit`. Pipeline:

1. `bun run format:fix` — auto-format all sources
2. `bun run check` — typecheck, lint, format verify, md lint
3. `bun test src/` — fast unit tests
4. `E2E_SAFEGUARD=1 bun test tests/e2e/` — full safeguarded e2e

`E2E_SAFEGUARD` validates DB is `:memory:`, uploads under `/tmp/`, auth disabled.
Set `E2E_SAFEGUARD=0` to bypass (dev-only — never in CI).

Goal: lightweight, extensible, maintainable, scalable.
