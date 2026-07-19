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

1. **`src/server.ts`** — HTTP entry point, starts the server.
2. **`src/db/`** — Database layer: Kysely init, schema types, enums, migrations, state machines.
3. **`src/config/`** — Configuration loading (file + env override).
4. **`src/routes/`** — REST handlers mounted under `/api/`.
5. **`src/assets/`** — Media CRUD, upload pipeline, polymorphic linking, metadata extraction.
6. **`src/assistant/`** — Prompt assembly, rule-based help system (swappable to LLM).
7. **`src/generation/`** — LLM generation: types, cancellation, pipeline, repetition/policy detection, streaming.
8. **`src/story/`** — Multi-LLM story engine (GM, quests, quality eval). Turn orchestration lives in `src/turning/`; story/ re-exports for compat.
9. **`src/turning/`** — Generalized turn orchestration (shared by story mode and group chat). Canonical TurnManager.
10. **`src/group-chat/`** — Multi-participant chat: mention parsing, turn selection.
11. **`src/content/`** — Content encoding (gzip/zstd/brotli), minification, compression.
12. **`src/crypto/`** — Encryption subsystem: actor keys, chat keys, BYOK, SMK, pipeline.
13. **`src/transport/`** — HTTP/1.1, HTTP/2, WebSocket, SSE streaming, content negotiation, compression.
14. **`src/middleware/`** — Auth, rate limiting, admin gate, response headers, pipeline composition.
15. **`src/logger/`** — Structured logging with levels, formatters, censors, rotation, queuing.
16. **`src/frontend/`** — Web UI: htmx app shell, chat vendor, gallery upload, htmx-encrypt, Alpine.js.
17. **`src/personas/`** — Persona CRUD (user-facing character aliases in chats).
18. **`src/plugins/`** — Plugin system: loader, registry, types.
19. **`src/characters/`** — Character steganography (embedding data in character cards).
20. **`src/profanity/`** — Profanity filtering service.
21. **`src/admin/`** — Admin panel: model role overrides, provider health checks.
22. **`src/build/`** — Build pipeline: compression, vendor copy.
23. **`src/services/`** — External server management utilities.
24. **`src/components/`** — Reusable HTML component partials.
25. **`src/partials/`** — HTMX partial templates (characters, gallery, worlds).
26. **`src/age-gate/`** — Age verification service + controller.
27. **`src/tui/`** — Blessed widgets (app, chat, asset view).
28. **`src/utils/`** — Shared utilities: safe JSON, date helpers.
29. **`src/views/`** — HTMX page templates (server-rendered web UI).
30. **`src/public/`** — Static assets for web UI (CSS, images, locales).
31. **`scripts/`** — Dev scripts: worktree management, GPG unlock, commit check, version bump
32. **`data/`** — Runtime SQLite DB, uploaded assets.
32. **`docs/`** — Specs, architecture, data model, UX spec.

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
./scripts/gpg-unlock.sh      # Unlock GPG passphrase (agent commits)
./scripts/worktree.sh list   # List active worktrees
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
| DB schema (all)      | `docs/spec/schema.md`             |
| Messages             | `docs/spec/messages.md`           |
| Users/sessions       | `docs/spec/users-sessions.md`     |
| Assets               | `docs/spec/assets.md`             |
| Actors               | `docs/spec/actors.md`             |
| Characters/persona   | `docs/spec/character-setup.md`    |
| RPG mechanics        | `docs/spec/rpg-mechanics.md`      |
| Architecture         | `docs/spec/architecture.md`       |
| Build/deploy         | `docs/spec/build-deploy.md`       |
| Implementation       | `docs/spec/implementation.md`     |
| API routes           | `docs/spec/api-routes.md`         |
| Auth middleware      | `docs/spec/auth-middleware.md`    |
| Error envelope       | `docs/spec/error-envelope.md`     |
| Crypto               | `docs/spec/crypto.md`             |
| Logging              | `docs/spec/logging.md`            |
| Content compression  | `docs/spec/content-compression.md`|
| TUI                  | `docs/spec/tui.md`                |
| Plugin system        | `docs/spec/plugin-system.md`      |
| Memory system        | `docs/spec/memory-system.md`      |
| Artifacts system     | `docs/spec/artifacts-system.md`   |
| Frontend extensions  | `docs/spec/frontend-extensions.md`|
| I18n                 | `docs/spec/i18n-implementation.md`|
| CI maintenance       | `docs/spec/ci-maintenance.md`     |
| Assets attribution   | `docs/spec/assets-attribution.md` |
| Plan / tasks         | `docs/meta/plan.md`               |
| Frontend UX          | `docs/frontend/overview.md`       |

## Common Pitfalls

1. **Forgetting `screen.render()` after TUI updates.** Blessed requires manual re-render.
2. **Importing DB-specific modules in services/controllers.** Use Kysely types + db instance only.
3. **Bare `.then()` waterfalls.** Always await or .catch().
4. **Skipping doc reading.** Always read relevant `docs/` before implementing.
5. **Pushing without `bun run check`.** Run typecheck + lint + format + md:lint first.

## Implementation Patterns (Quick Reference)

### Options-Object Parameters
Functions with 3+ params take a single destructured object:
```ts
function createQuest({ worldId, name, config, target }: CreateQuestOpts): Promise<string>
```
94 `*Opts/*Options/*Params/*Input` interfaces across codebase. Use for all new functions.

### Discriminated Unions for State
Tagged unions prevent "impossible states":
```ts
type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: User[] }
  | { status: "error"; error: Error };
```
Apply to: API responses, UI states, generation pipeline steps, event types.

### Exhaustiveness Checking
`assertNever` in default case catches missing enum/union cases at compile time:
```ts
function assertNever(value: never): never { throw new Error(`Unhandled: ${value}`); }
switch (status) {
  case GenerationStatus.Pending: return "waiting";
  // ...
  default: return assertNever(status);
}
```

### Branded Types for ID Safety
Prevent mixing up `userId`, `chatId`, `actorId` (all `string`):
```ts
type Brand<Base, Tag> = Base & { readonly __brand: Tag };
type UserId = Brand<string, "UserId">;
type ChatId = Brand<string, "ChatId">;
```

### Result Type Pattern
`JsonResult<T>` already exists — extend to all fallible operations:
```ts
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
```
Reserve exceptions for truly exceptional situations. Expected failures → Result.

### Factory Functions
Single export, inferred type via `ReturnType<typeof createXxx>`:
```ts
export function createTaskRunner(db: Kysely<DB>, config: RunnerConfig) { ... }
export type TaskRunner = ReturnType<typeof createTaskRunner>;
```
Use for: services with internal state, feature modules with single consumer.

### State Machine Application
`StateDef` + `StateMachine` from `src/db/state.ts` for lifecycle states:
- GenerationStatus, MessageStatus×Visibility (composite), QuestStatus
- Guard at service boundary: `machine.canTransition(from, to)`
- Never use `is_*` booleans for state axes