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
  [Zod](https://zod.dev) — schema-per-route pattern with shared field fragments,
  logger integration, and optional TypeBox swap for smaller bundle footprint

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

1. Extract `Authorization: Bearer <token>` header
2. SHA-256 hash the token
3. Look up `sessions` table by `token_hash`
4. Verify expiration, update `last_activity`
5. Fetch `users.role` for the session's `user_id`
6. Return `RequestContext`

Solo/demo mode (`auth.required: false`):

- Bypasses token check
- Returns a singleton solo user context
- No DB lookup per request

#### Pipeline Runner (`src/middleware/pipeline.ts`)

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

Request/response validation lives in `src/schemas/` using Zod (primary) or
TypeBox (swap-in alternative). Each route group gets a companion schema file
(`chats.schema.ts` alongside `chats.ts`).

#### Design

- **Single source of truth**: Schema = TypeScript type + runtime validation +
  OpenAPI documentation. Use `z.infer<typeof schema>` for types.
- **Composition**: Shared field fragments (`src/schemas/shared-fields.ts`)
  eliminate per-field duplication across schemas — e.g. `uidField`,
  `displayNameField`, `optionalDescription`, `paginationQuery`.
- **Enum sharing**: Route schemas import enum definitions from `src/db/enums.ts`
  (already single source of truth) — no enum duplication.
- **DB separation**: Kysely table types (`src/db/schema-*.ts`) remain unchanged
  — they describe DB rows. Zod schemas describe API contracts. Field overlap
  (~40%) is inherent: the API contract is a different boundary than the DB
  schema.
- **Logger integration**: Validation failures log at debug level via
  `getLogger().child({ module: "validation", requestId, userId })` — detailed
  issues in dev, silent in prod (error code returned to client).
- **No rewrite**: Existing route handlers, factories, seed data, and Kysely
  types are unaffected. Zod is additive — it wraps the existing `parseBody()`
  result and provides typed `.data`.

#### Pattern

```ts
// src/schemas/shared-fields.ts
export const uidField = z.string().uuid();
export const displayNameField = z.string().min(1).max(100);

// src/routes/chats.schema.ts
export const CreateChatSchema = z.object({
  name: displayNameField,
  type: z.nativeEnum(ChatType).optional().default(ChatType.Direct),
  participantIds: z.array(uidField).optional(),
});

// route handler
const body = CreateChatSchema.parse(await parseBody(request));
// body is fully typed: { name: string; type?: ChatType; ... }
```

#### TypeBox Alternative

TypeBox is a drop-in alternative to Zod with a smaller bundle (~5KB vs ~11KB
min+gzip) and faster validation. API differences: object notation vs method
chaining, `Static<typeof T>` vs `z.infer`. Swap if bundle size ever matters.
Both work with `bun build` zero config — pure TypeScript, no native deps.

#### Future: Elysia Framework

[Elysia](https://elysiajs.com) is the best Bun-native framework with built-in
validation (TypeBox-based `t`), OpenAPI generation (`@elysiajs/swagger`), and
end-to-end type safety via Eden Treaty. Evaluating post-MVP — migration requires
full server rewrite from `Bun.serve()` + custom router. Not for MVP. Tracked
for v1+.

### Database Layer

Located in `src/db/`

#### Database Approach

[Bun ships `bun:sqlite`](https://bun.sh/docs/api/sqlite) natively — fast, zero
deps. [Kysely](https://kysely.dev/) provides type-safe query building on top.

1. **SQLite (default):** Kysely with `BunSqliteDialect`:

   ```typescript
   import { Database } from "bun:sqlite";
   import { Kysely } from "kysely";
   import { BunSqliteDialect } from "kysely/bun-sqlite";

   const dialect = new BunSqliteDialect({
     database: new Database("data.db"),
   });
   const db = new Kysely<DB>({ dialect });
   ```

2. **Scaling up:** Swap to `PostgresDialect` from `kysely`:

   ```typescript
   import { Kysely, PostgresDialect } from "kysely";
   import { Pool } from "pg";

   const dialect = new PostgresDialect({
     pool: new Pool({ connectionString: process.env.DATABASE_URL }),
   });
   const db = new Kysely<DB>({ dialect });
   ```

3. **Same queries, different dialect** — Kysely normalizes across SQLite and
   Postgres. Store arrays/enums as JSON text for compatibility.

4. **Database Initialization** (`src/db/index.ts`):
   - Reads `DB_TYPE` env var (default: `sqlite`)
   - Instantiates Kysely with the appropriate dialect
   - Runs pending migrations on startup via `Migrator`

#### Schema and Migrations

- Schema defined as TypeScript interfaces in `src/db/schema.ts` (Kysely table
  types)
- Enum values centralized in `src/db/enums.ts` (barrel over `enums-*.ts` domain
  files) — const objects + type unions
- Migrations managed by Kysely Migrator, stored in `src/db/migrations/`
- Migration files are `.ts` with `up()`/`down()` exports
- See [`docs/schema.md`](./schema.md) for full table definitions

#### Current Migration Sequence

| #    | File                         | What it creates                                                                                                   |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 001  | `001_init.ts`                | Core tables: users, sessions, chats, actors, chat_participants, characters, messages, assets, asset_links, worlds |
| 002  | `002_age_gate.ts`            | `birth_date`, `age_gate_accepted_at` on users                                                                     |
| 003a | `003_generation_attempts.ts` | `generation_attempts` table                                                                                       |

> **Warning**: During MVP, `data_version` defaults to `0` across all actor
> records. When stabilising post-MVP, version bumps will be **forward-compatible
> only**: migrations add columns/tables, never remove. Existing `v0` records
> continue working; missing fields resolve to sensible defaults. See
> [`docs/actors.md`](./actors.md) for full versioning contract.

Future migrations (post-MVP):

- `003b_story_features.ts` — locations, story_turns, quests, quest_progress,
  world_states, npc_states, location_states, synthetic_data + new columns on
  chats
- `004_continuation_retry.ts` — Continuation & tree columns on
  generation_attempts + messages

### Actor System

Located in `src/routes/characters.ts` (no dedicated `src/actors/` directory) —
the `actors` table is the unified participant model. See
[`docs/actors.md`](./actors.md) for:

- **Character card imports** (SillyTavern V1/V2 — PNG-embedded and JSON)
- **Memories**: Learned facts across conversations (`actor_memories`)
- **Notes**: User-authored reference material (`actor_notes`)
- **Lorebooks**: Keyword-triggered knowledge entries (`actor_lore_entries`,
  `world_lore_entries`)
- **Inventory**: Items, equipment, quest items (`actor_items`)
- **Data versioning**: Forward-compatible schema evolution via `data_version`
- **Prompt assembly**: Order of fields injected into the LLM prompt

### Asset System (Replaces Gallery)

Located in `src/assets/`

See [`docs/assets.md`](./assets.md) for full specification.

The old gallery feature is replaced by the polymorphic assets system. Assets
support images, audio, and video with flexible linking to any entity via the
`asset_links` table. For code/documents/data, see the
[`docs/artifacts-system.md`](./artifacts-system.md) extension.

#### Service Layer (`src/assets/service.ts`)

- Encapsulates all asset database operations via Kysely
- Methods: `create`, `list`, `link`, `unlink`, `delete`

#### Controller (`src/assets/controller.ts`)

- Validates uploads (size, type, mime)
- Delegates to service

#### API Routes (in `src/assets/controller.ts`, not `src/routes/assets.ts`)

- `GET /api/assets` — List assets (filter by type)
- `POST /api/assets` — Upload new asset (multipart)
- `DELETE /api/assets/:id` — Remove asset
- `POST /api/assets/:id/links` — Link to entity
- `DELETE /api/assets/:id/links/:linkId` — Unlink from entity
- `GET /api/assets/:id/raw` — Serve original file
- `GET /api/assets/:id/compressed` — Serve compressed variant
- `GET /api/assets/:id/thumb` — Serve thumbnail

### Generation Module

Located in `src/generation/`

The generation module handles LLM text generation with streaming support, safety
checks, and continuation/retry features.

#### Files

| File                      | Purpose                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                | Core types: `GenerationOptions`, `GenerationResult`, `ContinueRequest`, `RetryFromPointRequest`, repetition/policy configs |
| `cancellation-manager.ts` | AbortController-based cancellation — user cancel, chat-switch, timeout                                                     |
| `continuation.ts`         | Continue truncated/cancelled messages — preserves partial content, appends via child message                               |
| `step-pipeline.ts`        | Multi-step generation pipelines with retry-from-point (generate → caption → attach)                                        |
| `repetition-detector.ts`  | StreamingRepetitionDetector — n-gram fingerprinting to detect loops                                                        |
| `policy-detector.ts`      | Pluggable PolicyDetector interface — register detectors, no hardcoded keywords                                             |
| `controller.ts`           | Route handler for generation endpoints                                                                                     |
| `index.ts`                | Barrel exports                                                                                                             |

#### Key Features

- **Idempotent retries**: SHA-256 key from
  `(chat_id, parent_message_id, operation, model)` prevents duplicate
  generations
- **Continuation**: Partial/cancelled messages preserved — Continue creates a
  child message chain (A → B → C)
- **Multi-step pipelines**: Retry resumes from the failed step (not from step 0)
- **Streaming repetition detection**: N-gram fingerprinting in the streaming
  chunk pipeline
- **Policy detection**: Pluggable `PolicyDetector` interface — no hardcoded
  keyword lists
- **Cancellation tracking**: `abort_signal_id` on `generation_attempts` for
  AbortController coordination

#### Generation Status Lifecycle

A `generation_attempt` progresses through states in sequence, with terminal
states at the end:

**Forward progression:**

1. `pending` — Queued, not yet picked up by worker
2. `processing` — Actively being generated (LLM/backend call in-flight)
3. `streaming` — Tokens are streaming to client (only for streaming providers)
4. `completed` — Generation finished successfully, result stored

**Terminal transitions from any non-completed state:**

- `failed` — Error occurred (API error, timeout, connection failure). Can be
  retried (new attempt)
- `cancelled` — Stopped by user action, repetition detection, policy violation,
  chat switch, or system abort

Any of `pending`, `processing`, or `streaming` can transition directly to
`failed` or `cancelled`.

#### DB Table

See `generation_attempts` in [`docs/schema.md`](./schema.md). Tracks:

- Idempotency key, model, provider, status
- Cancel reason + source (user/auto/system)
- Streaming metadata (chunks received, chars received)
- Repetition/policy analysis data
- Continuation chain (`parent_attempt_id`, `continuation_count`)
- Multi-step pipeline (`step_index`, `total_steps`)

#### API Endpoints

| Method | Path                           | Purpose                                            |
| ------ | ------------------------------ | -------------------------------------------------- |
| `POST` | `/api/generation/continue`     | Initiate continuation of partial/cancelled message |
| `POST` | `/api/generation/retry`        | Retry generation from specified step index         |
| `POST` | `/api/messages/:id/evaluate`   | Trigger quality evaluation (story mode)            |
| `POST` | `/api/messages/:id/regenerate` | Request regeneration                               |
| `GET`  | `/api/messages/:id/attempts`   | List generation attempts for a message             |

### Story Module (Multi-LLM Generation)

Located in `src/story/`

See
[`docs/frontend/chat/multi-llm-story.md`](./frontend/chat/multi-llm-story.md)
for the full specification of the multi-LLM story generation system.

#### Files

| File                     | Purpose                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `types.ts`               | Barrel re-export of story domain types from the split type modules below                                                       |
| `story-types.ts`         | `GameMasterConfig`, quality evaluation, `StoryContext`, `TurnManagerState` + `DEFAULT_QUALITY_THRESHOLDS`/`WEIGHTS`            |
| `quest-types.ts`         | Quest config variants (Time/Collection/Destruction/Rescue/Discovery/Social/Composite), `QuestReward`, create/progress requests |
| `story-events-types.ts`  | `WorldEvent`, `NpcState`, `LocationState` types                                                                                |
| `story-api-types.ts`     | API request shapes: `StartStory`, `StepStory`, `ConfigureStory`, `GameMasterOverride`, `SyntheticGenerate`, `SyntheticTestRun` |
| `turn-manager.ts`        | Re-export of the generalized `TurnManager` (lives in `src/turning/`)                                                           |
| `game-master.ts`         | `GameMasterService` — LLM/Human/Hybrid turn execution, GM decisions, accept/override, inject narration, pause/resume           |
| `quality-evaluator.ts`   | `QualityEvaluator` — multi-dimension heuristic scoring against `QualityThresholds`                                             |
| `world-state.ts`         | `WorldStateService` — world/NPC/location state snapshots, context assembly for the GM                                          |
| `items.ts`               | `ItemsService` — item definitions, instances, transfers                                                                        |
| `quest-engine.ts`        | `QuestEngine` — quest lifecycle, per-chat progress tracking, reward application                                                |
| `events/`                | World-event pipeline: `extraction.ts` (regex), `validation.ts`, `application.ts`, `index.ts`                                   |
| `synthetic/generator.ts` | `SyntheticGenerator` — Phase 6 QA scenario derivation (all 6 `SyntheticDataType`) + `synthetic_data` status state machine      |
| `synthetic/types.ts`     | `SyntheticCase`, `SyntheticSource` shapes                                                                                      |
| `synthetic/runner.ts`    | `SyntheticTestRunner` — executes `SyntheticData` scenarios against the pipeline (5 modes)                                      |
| `index.ts`               | Barrel exports                                                                                                                 |

#### Synthetic Test Runner

`SyntheticTestRunner` (`src/story/synthetic/runner.ts`) executes captured
`SyntheticData` scenarios against the story pipeline and reports pass/fail per
case. It is **read-only**: quest progression and GM escalation are evaluated
against live DB state without mutating it, and quality scoring uses
`QualityEvaluator` directly (no LLM).

Constructor takes `SyntheticTestRunnerOptions`: `db`, an optional
`qualityEvaluator` (constructed if omitted), `turnManagerFactory` (for
turn-sequence orchestration replay), `gameMaster` (for live escalation
decisions), `idGenerator`, `defaultIterations`, and `autoValidate`.

**Modes** (`run(scenarioIds, mode, mutationParams?)`):

| Mode          | Behavior                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `replay`      | Re-run each scenario through its pipeline component; compare `actual` to `expected`                |
| `regression`  | Same as replay; asserts results match the captured expectation                                     |
| `mutation`    | Jitter quality inputs (`promptVariations`) and assert score variance ≤ `temperatureVariance * 100` |
| `calibration` | Run all quality cases; aggregate scores and propose `accept`/`regenerate`/`escalate` thresholds    |
| `stress`      | Repeat each case `defaultIterations`× and assert score consistency                                 |

**Per-type execution** (dispatch on `synthetic_data.type`):

| `SyntheticDataType`      | Execution                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `quality_evaluation`     | `QualityEvaluator.evaluate({ response, actorName })` → score + pass                     |
| `turn_sequence`          | Structural check; `skipped` unless `turnManagerFactory` supplied                        |
| `quest_progression`      | Read-only compute from live `quests.target` (no mutation)                               |
| `world_state_transition` | Structural diff of `from`/`to` snapshots; `consistent` = no type changes on shared keys |
| `regeneration_case`      | Baseline score via `QualityEvaluator`; `warranted` = baseline < `improvedScore`         |
| `gm_escalation`          | Heuristic (active quest ⇒ escalated) when no `gameMaster`; else `skipped`               |

**Result shape:**

```ts
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
```

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
```

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

```bash
# Clone repository
git clone <repository-url>
cd loop-lore

# Install dependencies
bun install

# Copy example configuration
cp .env.example .env

# Initialize database
bun run db:migrate

# Start development server
bun run dev

# In another terminal, start TUI
bun run tui
```

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
