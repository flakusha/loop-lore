> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Implementation Details

## Technology Stack

### Backend

- **Runtime**: [Bun](https://bun.sh) — Fast TypeScript/JavaScript runtime, runs
  `.ts` directly
- **Language**: TypeScript 5.4+ strict mode
- **Database**:
  - Primary: SQLite (via `bun:sqlite` — native, no extra deps) for local
    development
  - Query Builder: [Kysely](https://kysely.dev/) with `BunSqliteDialect` —
    type-safe queries, dialect-swappable
  - Scaling up: Swap to `PostgresDialect` from `kysely` with `pg` pool
- **Server**: Bun's built-in HTTP server (no Express/Koa dependency)
- **Middleware**: Lightweight composable pipeline (auth, role guard, logging)
  built on Bun fetch; no framework
- **Validation**: Kysely type system at compile time; runtime validation via
  Elysia's TypeBox-based `t` schemas in `src/validation/schemas.ts` — schema-per-route
  group with shared field fragments, logger integration. (A Zod migration is
  aspirational — see `docs/meta/code-practices-improvements/06-schemas-and-openapi.md`.)

### Frontend

- **Web UI**: htmx (server-driven AJAX) + Alpine.js (client-side interactivity)
- **TUI Mode**: [`blessed`](https://github.com/chjj/blessed) — curses-like
  terminal UI library
- **Documentation**: VitePress SSG for rich docs, optional; plain Markdown
  default

### Tooling

- **Package Manager**: Bun's built-in package manager
- **Type Checking**: TypeScript compiler (`tsc --noEmit`)
- **Linting**: ESLint 9 (flat config) with `typescript-eslint`
  strictTypeChecked, `unicorn`, `sonarjs`
- **Formatting**: Prettier
- **Markdown**: `markdownlint-cli2` for docs quality

## Core Implementation Details

### Middleware Pipeline

Located in `src/middleware/`

#### Architecture

Lightweight composable pipeline built on Bun's native fetch handler. No
Express/Koa dependency. Each middleware receives `(request, context, next)` and
either short-circuits (returns `Response`) or calls `next()` with enriched
context.

Middleware processes each request through these stages:

1. **Auth middleware** — Extracts Bearer token, SHA-256 hashes it, looks up
   session in DB. If invalid → returns `401 Unauthorized`. On success →
   populates `RequestContext`
2. **Role guard** — Checks route permissions against `context.userRole`. If role
   lacks access → returns `403 Forbidden`
3. **Route dispatch** — Delegates to domain controller. Controller calls service
   → service calls DB. Returns `Response`
4. **Error boundary** — Catches exceptions from any middleware or handler →
   returns structured error envelope

#### RequestContext

Shared context object passed through the pipeline, populated by auth middleware
and consumed by route handlers:

```
RequestContext { userId, userRole, sessionId }
```

#### Auth Middleware (`src/middleware/auth.ts`)

Opaque session token model (no JWT dependency):

- Bypasses token check
- Returns a singleton solo user context
- No DB lookup per request

`compose(middleware[], finalHandler)` — chains middleware left-to-right. Each
middleware receives `(request, context, next)` and either returns `Response` to
short-circuit or calls `await next()` to pass through. The final handler is the
route dispatcher. Errors bubble to the error boundary middleware.

#### Priority

1. **Auth** — session extraction, user identity
2. **Access control** — role gates on admin routes (see
   `docs/users-sessions.md`)
3. **Validation** — incremental, per-route schema checks (phased implementation)

Rate limiting implemented in-app (`src/middleware/rate-limit.ts`) for login
endpoint (10/min per IP). Also deferred to reverse proxy for production rate
limiting beyond login.

### Runtime Validation Layer

> Note: a `src/schemas/` Zod layer does not exist. The implemented stack is
> Elysia `t` (TypeBox) schemas centralized in `src/validation/schemas.ts`. The
> design below describes the **current** TypeBox approach; the Zod/OpenAPI
> migration is aspirational only (see `docs/meta/code-practices-improvements/06-schemas-and-openapi.md`).

Request/response validation lives in `src/validation/schemas.ts` using Elysia's
TypeBox `t` schemas. Each route group defines its request/response schemas there.

#### Design

- **Single source of truth**: Schema = TypeScript type + runtime validation +
  OpenAPI documentation. Use `t.Static<typeof schema>` for inferred types.
- **Composition**: Shared field fragments in `src/validation/schemas.ts`
  eliminate per-field duplication across schemas — e.g. `uidField`,
  `displayNameField`, `optionalDescription`, `paginationQuery`.
- **Enum sharing**: Route schemas import enum definitions from `src/db/enums.ts`
  (already single source of truth) — no enum duplication.
- **DB separation**: Kysely table types (`src/db/schema-*.ts`) remain unchanged
  — they describe DB rows. Validation schemas describe API contracts. Field
  overlap (~40%) is inherent: the API contract is a different boundary than the
  DB schema.
- **Logger integration**: Validation failures log at debug level via
  `getLogger().child({ module: "validation", requestId, userId })` — detailed
  issues in dev, silent in prod (error code returned to client).
- **No rewrite**: Existing route handlers, factories, seed data, and Kysely
  types are unaffected. The TypeBox schema validates the parsed body and
  provides typed `.data`.

### Database Layer

Located in `src/db/`

#### Database Approach

[Bun ships `bun:sqlite`](https://bun.sh/docs/api/sqlite) natively — fast, zero
deps. [Kysely](https://kysely.dev/) provides type-safe query building on top.

1. **SQLite (default):** Kysely with `BunSqliteDialect`:

   ts
   interface SyntheticTestCaseResult {
   scenarioId: string; // parent SyntheticData row
   caseId: string;
   scenarioType: SyntheticDataType;
   mode: SyntheticTestMode;
   status: "passed" | "failed" | "skipped";
   expected: Record<string, unknown>;
   actual: Record<string, unknown>;
   reason?: string;
   }

interface SyntheticTestRunResult {
runId: string;
mode: SyntheticTestMode;
total: number;
passed: number;
failed: number;
skipped: number;
results: SyntheticTestCaseResult[];
summary: { passRate: number; suggestedThresholds?: { accept; regenerate; escalate } };
startedAt: string;
finishedAt: string;
}

````
When `autoValidate` is set and a `synthetic_data` row passes every case in
`replay`/`regression`, the runner transitions it to `validated` via
`syntheticDataStatusMachine` (no free mutation).

**Routes:** not wired — `POST /api/synthetic/test/run` (and a results
endpoint) are pending, per the "no wiring yet" directive. The request shape
`SyntheticTestRunRequest` already exists in `story-api-types.ts`.

#### Implemented State

**Implemented (no route wiring yet — by design):**

- Turn orchestration — `src/turning/` `TurnManager` (5 strategies, regeneration, pause/resume, `chats.story_state` persistence)
- GM execution — `GameMasterService` (LLM/Human/Hybrid, decisions, override, narration inject)
- Quality evaluation — `QualityEvaluator` (heuristic multi-dimension scoring)
- World state — `WorldStateService` (snapshots, NPC/location dynamics, context feed)
- Items — `ItemsService`
- Quests — `QuestEngine` (lifecycle + progress + rewards)
- World-event pipeline — `events/` extract → validate → apply
- Synthetic generation — `SyntheticGenerator` (Phase 6) with `syntheticDataStatusMachine`
  (generated → validated → approved/rejected → archived); covered by
  `synthetic/generator.test.ts` (5 tests)
- Synthetic test _runner_ — `SyntheticTestRunner` executes `SyntheticData` scenarios
  in 5 modes (replay / mutation / regression / calibration / stress) against the
  pipeline; read-only (quest/escalation evaluated against live DB state without
  mutating it). LLM-backed paths (TurnManager orchestration, GM decisions) are
  optional; when absent the runner falls back to structural/heuristic checks and
  marks cases `skipped`.

**Pending:**

- Story + synthetic REST surface — `/api/story/*` and `/api/synthetic/*`
  controllers/routes are not implemented (deferred per "no wiring yet").

**Schema:** `locations`, `story_turns`, `quests`, `quest_progress`, `world_states`,
`npc_states`, `location_states`, `synthetic_data` (see [`docs/schema.md`](./schema.md)).
Note: there is **no** `world_events` table — world events live inside
`world_states.snapshot` (JSON); `WorldStateTransition` synthetic cases derive from
snapshot diffs.

#### Turn Strategies

| Strategy       | Description                                        | Method                |
| -------------- | -------------------------------------------------- | --------------------- |
| `round_robin`  | Fixed order: Actor A → B → C → A...                | `roundRobinSelect()`  |
| `scene_based`  | Narrator every 3rd turn, otherwise round-robin     | `sceneBasedSelect()`  |
| `initiative`   | Random shuffle per turn (initiative roll)          | `initiativeSelect()`  |
| `quest_driven` | Prioritize actors relevant to active quests        | `questDrivenSelect()` |
| `hybrid`       | Quest-driven every 5th turn, scene-based otherwise | `hybridSelect()`      |

#### Turn Manager State

The `TurnManager` serializes its state to `chats.story_state` (JSON) for crash
resilience. State includes: current turn number, current actor, turn order,
strategy, pause flag, pending regeneration info.

### Assistant

Located in `src/assistant/`

#### Service Layer (`src/assistant/service.ts`)

- Rule-based MVP: keyword detection → predefined responses with confidence
  scores
- Response shape: `{ type, content, confidence }`
- Designed to be swapped for LLM-backed agent runtime later
- See [`docs/use-case-agentic-workspace.md`](./use-case-agentic-workspace.md)
  for the planned evolution into an **Agent Runtime**

#### **Note:** No dedicated `src/assistant/controller.ts` or `POST /api/assistant` endpoint exists.

> The assistant is invoked internally by `src/routes/messages.ts` during
> generation. A standalone API endpoint is aspirational (post-MVP).

### Content Module

Located in `src/content/`

Utilities for content encoding, decoding, minification, and asset compression:

| File          | Purpose                                                          |
| ------------- | ---------------------------------------------------------------- |
| `encode.ts`   | `encodeContent()` — encode message content (gzip/zstd/brotli)    |
| `decode.ts`   | `decodeContent()` — decode message content                       |
| `minify.ts`   | `minifyText()` — strip whitespace/newlines for compact storage   |
| `compress.ts` | `compressAssets()` — batch compression of uploaded assets        |
| `types.ts`    | Shared types: `ContentEncoding`, `EncodeResult`, `DecodeOptions` |

### Age Gate Module

Located in `src/age-gate/`

Provides user age verification for NSFW content compliance:

| File              | Purpose                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `service.ts`      | `AgeGateService` — validates birth dates, calculates age, checks minimum age |
| `controller.ts`   | Route handler — accepts birth date, validates, returns status                |
| `service.test.ts` | Unit tests for age calculation and minimum age enforcement                   |

- Configurable: `ageGate.enabled`, `ageGate.minimumAge`, `ageGate.mode`
- Modes: `none`, `self-declaration`, `verification` (reserved)

### Plugin System

Located in `src/plugins/` (planned)

See [`docs/plugin-system.md`](./plugin-system.md) for the full specification.
See also [`docs/use-case-agentic-workspace.md`](./use-case-agentic-workspace.md)
for the plugin architecture design in the agentic context.

Three plugin types:

- **Core plugins**: Bundled with loop-lore — dice roller, code executor, web
  research
- **Community plugins**: Third-party, installed from registry
- **Local plugins**: User-created, dropped in `plugins/local/`

The Plugin interface exposes lifecycle hooks (`onLoad`, `onUnload`) and
extension points: tools, agent roles, API routes, UI components, event handlers,
migrations.

### Memory System

See [`docs/memory-system.md`](./memory-system.md) for the three-tier memory
architecture:

- **Episodic**: Chronological conversation records → stored as messages
- **Semantic**: Extracted facts, concepts, relationships → stored as assets
- **Procedural**: Learned patterns, skills, strategies → stored in actor
  settings

### TUI Mode

Located in `src/tui/` — detailed in [`docs/tui.md`](./tui.md)

#### Main Application (`src/tui/app.ts`)

- Sets up the blessed screen
- Initializes and manages child components (chat view, gallery view, input
  handler)
- Handles global keyboard shortcuts (exit on Escape/q/Ctrl+C)
- Coordinates data flow between components

#### Chat View (`src/tui/chat.ts`)

- Displays message history using blessed's `Log` widget
- Methods for adding messages, setting current chat, loading gallery for chat
- Integrates with gallery service to display linked media

#### Gallery View (`src/tui/gallery-view.ts`)

- Displays gallery items for current chat using blessed's `Box` widget
- Navigation: Left/Right arrows to browse items
- Actions: Enter to link item, Delete to remove item

#### Input Handler (`src/tui/input.ts`)

- Manages text input at bottom of screen using blessed's `Textbox` widget
- Captures Enter key to submit messages
- Clears input after submission

### API Integration

- TUI communicates with backend API using relative URLs (same origin)
- Uses `fetch` API for HTTP requests
- Error handling displays messages in chat view

## Configuration

Config loaded from project root: `config.yaml`, `config.yml`, or `config.toml`.
Falls back to defaults if no file found.

### Config Schema

See `src/config/schema.ts` for the full `Config` interface with TypeScript
types.

```yaml
server:
  port: 3000
  host: "localhost"
  tls:
    key: "./data/certs/key.pem" # auto-generated if missing
    cert: "./data/certs/cert.pem" # auto-generated if missing

db:
  type: sqlite # "sqlite" or "postgres"
  sqliteFilename: "../loop-lore-data/loop-lore.db"
  # For Postgres: url: "postgres://..."

assets:
  enabled: true
  uploadDir: "../loop-lore-data/uploads"
  maxFileSize: 10485760 # 10 MB
  compression: true

assistant:
  enabled: true

logging:
  level: debug # "debug", "info", "warn", "error"

tui:
  enabled: true

docs:
  enabled: true
  # public: ["guide", "frontend"]    # restrict to user-facing sections

ageGate:
  enabled: false
  minimumAge: 18
  mode: self-declaration # "none", "self-declaration", "verification"

auth:
  required: false # true = remote multi-user, false = demo/solo
  registrationOpen: true # allow new user registration
  sessionTimeoutHours: 24 # idle session timeout
  maxSessionsPerUser: 10 # max simultaneous sessions per user
````

### Environment Variable Override

Env vars override config file values (12-factor style). Mapping in
`src/config/load.ts`:

| Env Var                  | Config Path                | Type    |
| ------------------------ | -------------------------- | ------- |
| `PORT`                   | `server.port`              | number  |
| `HOST`                   | `server.host`              | string  |
| `DB_TYPE`                | `db.type`                  | string  |
| `SQLITE_FILENAME`        | `db.sqliteFilename`        | string  |
| `DATABASE_URL`           | `db.url`                   | string  |
| `ENABLE_ASSETS`          | `assets.enabled`           | boolean |
| `ASSETS_UPLOAD_DIR`      | `assets.uploadDir`         | string  |
| `ASSETS_MAX_FILE_SIZE`   | `assets.maxFileSize`       | number  |
| `ASSETS_COMPRESSION`     | `assets.compression`       | boolean |
| `ENABLE_ASSISTANT`       | `assistant.enabled`        | boolean |
| `LOG_LEVEL`              | `logging.level`            | string  |
| `ENABLE_TUI`             | `tui.enabled`              | boolean |
| `ENABLE_DOCS`            | `docs.enabled`             | boolean |
| `TLS_KEY`                | `server.tls.key`           | string  |
| `TLS_CERT`               | `server.tls.cert`          | string  |
| `AUTH_REQUIRED`          | `auth.required`            | boolean |
| `AUTH_REGISTRATION_OPEN` | `auth.registrationOpen`    | boolean |
| `SESSION_TIMEOUT_HOURS`  | `auth.sessionTimeoutHours` | number  |
| `SESSION_MAX_PER_USER`   | `auth.maxSessionsPerUser`  | number  |

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Git

### Installation

### Available Scripts

| Command                 | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `bun run dev`           | Development server with `--watch`                                |
| `bun run start`         | Production server                                                |
| `bun run tui`           | Start TUI interface                                              |
| `bun run build`         | TypeScript compile to `./dist` (optional — Bun runs TS directly) |
| `bun run db:migrate`    | Run database migrations                                          |
| `bun run check`         | Full quality check: typecheck → lint → format → md:lint          |
| `bun run lint`          | Run ESLint                                                       |
| `bun run lint:fix`      | Auto-fix ESLint issues                                           |
| `bun run format`        | Check formatting with Prettier                                   |
| `bun run format:fix`    | Auto-format with Prettier                                        |
| `bun run typecheck`     | `tsc --noEmit`                                                   |
| `bun run test`          | Run tests (Jest-compatible API)                                  |
| `bun run test:coverage` | Run tests with coverage                                          |
| `bun run md:lint`       | Lint markdown files                                              |
| `bun run md:lint:fix`   | Auto-fix markdown issues                                         |
| `bun run docs:dev`      | Start VitePress dev server for docs                              |
| `bun run docs:build`    | Build VitePress docs                                             |

## Production Deployment

### Disabling Documentation in Production

1. Set environment variable: `DOCS_ENABLED=false`
2. Or set in config: `{ docs: { enabled: false } }`

### Environment-specific Configuration

- Create `.env.production` for production-specific variables
- Use `NODE_ENV=production` to enable production optimizations
- Consider using a process manager like PM2 or systemd

### Reverse Proxy Setup

Recommended to put behind a reverse proxy (NGINX, Caddy, etc.) for:

- SSL termination
- Load balancing
- Static file serving (if serving web UI)
- Rate limiting (rate limiting is deferred to reverse proxy; no in-app rate
  limiter)

## Testing Strategy

### Unit Tests

- Test individual services (assistant, generation, database adapters)
- Mock external dependencies (database, APIs)
- Framework: Bun's built-in test runner (`bun test` — Jest-compatible API)

### Integration Tests

- Test API endpoints using `fetch` with full server lifecycle
- Test database migrations and rollbacks
- Test service interactions

### End-to-End Tests

- Manual testing checklist for features
- Synthetic data from story sessions can generate regression test scenarios

## Build Artifacts

- Prebuilt HTML templates stored in `src/views/` (served directly in dev)
- Pre-compressed (gzip/brotli) variants served when available
- Bun handles `If-None-Match` / `If-Modified-Since` for caching
- See [`docs/build-deploy.md`](./build-deploy.md) for full deployment guide
- See [`docs/architecture.md`](./architecture.md) for system architecture
  overview

## License

This project is licensed under the LGPL-3.0-or-later License (core code).\
Documentation is MIT. Plugins may use Apache-2.0 OR MIT.\
See [LICENSE](../../LICENSE) and [LICENSES/](../../LICENSES/) for full texts.
