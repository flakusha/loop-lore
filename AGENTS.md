# AGENTS.md

Instructions for coding agents on loop-lore.

## Reference Material

Deep-dive docs in `/docs/` — read before touching related code:

### Core System

| File                               | Covers                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `docs/spec/schema.md`              | Full DB schema (all tables: core, generation, story, actors, assets)    |
| `docs/spec/messages.md`            | Message persistence, detail levels, invalid message handling            |
| `docs/spec/users-sessions.md`      | User roles, remote sessions, demo/solo mode                             |
| `docs/spec/assets.md`              | Asset system (images/audio/video), upload pipeline, polymorphic linking |
| `docs/spec/actors.md`              | Actor data model: character cards, memories, lorebooks, inventory       |
| `docs/spec/character-setup.md`     | Character & persona system: multi-format import/export, impersonation   |
| `docs/spec/rpg-mechanics.md`       | RPG mechanics: stats, combat, equipment, dice, skills, XP, loot         |
| `docs/spec/architecture.md`        | System layers, request flow, docs serving                               |
| `docs/spec/build-deploy.md`        | Minimum-build setup, build pipeline, deployment options                 |
| `docs/spec/implementation.md`      | Tech stack, all modules (db, gen, story, assets, assistant, TUI)        |
| `docs/spec/tui.md`                 | Blessed component hierarchy, keyboard map, data flow                    |
| `docs/spec/plugin-system.md`       | Plugin architecture: types, lifecycle, security, examples               |
| `docs/spec/memory-system.md`       | Three-tier memory: episodic, semantic, procedural                       |
| `docs/spec/artifacts-system.md`    | Code, documents, datasets as polymorphic assets                         |
| `docs/spec/crypto.md`              | Encryption: actor keys, chat keys, BYOK, SMK, key hierarchy             |
| `docs/spec/logging.md`             | Structured logging: levels, formatters, censors, rotation, transport    |
| `docs/spec/content-compression.md` | Content encoding: gzip/zstd/brotli, minification, hash injection        |
| `docs/spec/api-routes.md`          | API route contract — all endpoints, conventions, error envelope         |
| `docs/spec/auth-middleware.md`     | Auth middleware — token flow, session model, role guard, rate limiting  |
| `docs/spec/error-envelope.md`      | Standard error envelope — codes, shapes, patterns, frontend sync        |
| `docs/meta/plan.md`                | MVP implementation checklist with week-by-week tasks                    |

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
| `docs/frontend/chat/message-bubbles.md`  | Visual spec: bubble styling, avatars, grouping, markdown, media layout, detail levels, thinking, system msgs  |
| `docs/frontend/chat/message-actions.md`  | Actions spec: toolbars, button sets, keyboard shortcuts, mobile touch, threading, reactions, pinned msgs     |
| `docs/frontend/chat/generation.md`        | Typing indicator, streaming, generation status per mode, 3-tier error handling, chat-switch guard, idempotent retries              |
| `docs/frontend/chat/archiving.md`         | Cascade deletion, restore, purge flows                                                                                             |
| `docs/frontend/chat/input.md`             | Text input, media attach, LLM selector, message improvement, image generation                                                      |
| `docs/frontend/chat/memories.md`          | Character/assistant/world memories, memory selection, auto-purge, token budget                                                     |
| `docs/frontend/chat/commands-and-misc.md` | Keyboard shortcuts, states summary, image pipeline, system/narration messages                                                      |
| `docs/frontend/chat/multi-llm-story.md`   | Multi-LLM story generation: GM, turn-taking, quests, quality evaluation, synthetic data                                            |
| `docs/frontend/chat/assistant.md`         | Assistant as GM/Moderator, tool assistance, idea suggestions, text improvement                                                     |
| `docs/frontend/chat/export.md`            | Chat export formats, public sharing, read-only links, story publishing                                                             |
| `docs/frontend/chat/group-chat.md`        | Multi-participant chat, turn order, @mentions, initiative tracking                                                                 |
| `docs/frontend/characters.md`             | Character list grid, create/edit form                                                                                              |
| `docs/frontend/gallery.md`                | Asset gallery grid, preview modal, upload dialog                                                                                   |
| `docs/frontend/admin.md`                  | Admin panel: user mgmt, chat mgmt, world permissions, audit log, content review, system config                                     |
| `docs/frontend/settings.md`               | Settings sections: general, chat, API config, theme customization, data management                                                 |
| `docs/frontend/worlds.md`                 | World entity: list, detail, create/edit                                                                                            |
| `docs/frontend/login.md`                  | Login page: auth card, demo mode, error states                                                                                     |
| `docs/frontend/encryption.md`             | User secret keys, AES-256-GCM at-rest message encryption, API key encryption, key hierarchy                                        |
| `docs/frontend/age-gate.md`               | Age verification page, self-declaration flow, redirect behavior                                                                    |
| `docs/frontend/component-architecture.md` | HTMX/Alpine.js boundaries, component lifecycle, state management                                                                   |
| `docs/frontend/headers-management.md`     | Response headers (security/performance), frontend header components, htmx navigation                                               |
| `docs/frontend/internationalization.md`   | UI translation, LLM language selection, actor language preferences, i18n architecture                                              |
| `docs/frontend/components.md`             | Shared components: toasts, modals, spinners, skeletons, empty states, chips, drop zones                                            |
| `docs/frontend/notifications.md`          | Notification system: types, storage, delivery, prompt injection, preferences, lifecycle                                            |
| `docs/frontend/prompt-creation.md`        | Prompt templates, variable injection, actor context, generation tuning                                                             |

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
├── elysia-app.ts        Elysia app setup
├── db/                  DB layer
│   ├── enums.ts         Centralized enum source of truth
│   ├── schema.ts        Kysely table types (all tables)
│   ├── migrations/      Kysely Migrator files
│   └── index.ts         Kysely init + exports (bun:sqlite dialect)
├── config/              Configuration loading (file + env override)
│   ├── schema.ts        Config interface + defaults
│   └── load.ts          File detection, parse, merge, validate
├── routes/              REST handlers
├── assets/              Media CRUD, uploads, metadata extraction
├── assistant/           Prompt assembly, rule-based help
├── generation/          LLM generation: types, cancellation, continuation,
│                        step-pipeline, repetition detection, policy detection,
│                        streaming, prompt templates
├── story/               Multi-LLM story: GM, quests, quality eval, world state.
│                        Turn orchestration in src/turning/; story/ re-exports.
├── turning/             Generalized turn orchestration (canonical TurnManager)
├── group-chat/          Multi-participant chat: mention parsing, turn selection
├── content/             Content encoding (gzip/zstd/brotli), minification, compression
├── crypto/              Encryption: actor keys, chat keys, BYOK, SMK, pipeline
├── transport/           HTTP/1.1, HTTP/2, WebSocket, SSE, negotiation, compression
├── middleware/           Auth, rate limiting, admin gate, headers, pipeline
├── logger/              Structured logging with levels, formatters, censors, rotation
├── frontend/            Web UI: htmx app shell, chat vendor, Alpine.js, htmx-encrypt
├── personas/            Persona CRUD
├── plugins/             Plugin system: loader, registry, types
├── characters/          Character steganography
├── profanity/           Profanity filtering
├── admin/               Model role overrides, provider health
├── build/               Build pipeline
├── services/            External server manager
├── components/          Reusable HTML component partials
├── partials/            HTMX partial templates
├── age-gate/            Age verification service, controller, tests
├── tui/                 Blessed widgets: app, chat, asset view
├── utils/               Safe JSON, date helpers
├── utils.ts             Shared utility functions (root)
├── views/               HTMX page templates (server-rendered web UI)
├── public/              Static assets (CSS, images, favicon, locales)
├── scripts/             Commit check, version bump
├── test-utils/          Mock provider for tests
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

See `.agents/references/cli-config.md` for command reference.

## Getting Started for Agents

1. Read relevant `docs/` file for the feature you're working on
2. Check existing code in `src/` for patterns (look at similar implementations)
3. Plan: what files change/create? Tests? Side effects?
4. Implement: follow conventions above
5. Verify: `bun run format:fix && bun run check && bun test src/` for server,
   `bun run src/tui/app.ts` for TUI

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
