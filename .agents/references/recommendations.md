# Recommendations

## Schema Design
- Every entity with lifecycle states gets a `StateDef` + `StateMachine` in its enum file
- Composite states (status × visibility) validated via `CompositeValidator`
- Prefer `TEXT` columns with string enums over `INTEGER` magic constants
- JSON blob columns OK for flexible settings; typed fields for queryable data
- Distinguish lifecycle state (use state machine) from intrinsic properties (use boolean if truly singular) and orthogonal flags (use boolean if independent axes)

## Code Structure
- One class/feature per file; `<200` lines preferred; `index.ts` exports public API
- Feature family grouped in `src/<name>/` with `service.ts | controller.ts | types.ts`
- Avoid circular imports — import from `enums.ts` barrel, never sibling feature modules
- **Options-object parameters** — functions with 3+ params take a single destructured object (`function fn({a, b, c, d?})`) over positional args (`function fn(a, b, c, d?)`). Benefits: named at call site, optional without placeholders, auto-declared variable names inside function, extensible without breaking callers

## Error Handling
- Controllers: try/catch → proper HTTP (200/201/204/400/401/403/404/422/500/501)
- Services: throw typed errors (`NotFoundError`, `ValidationError`)
- Pipeline: `compose([errorBoundary, authenticate], handler)` wraps all routes

## State Machine Patterns
- Framework: `StateDef<S>` + `createMachine(def)` → `StateMachine<S>` in `src/db/state.ts`
- Define state machines in `src/db/enums-*.ts` alongside the enum they govern
- Every `StateDef` specifies: `values`, `initial`, `transitions` (valid moves), `terminal` (absorbing states)
- Multi-axis state validated via `CompositeValidator` (e.g., message status × visibility)
- Non-terminal states: `sending`, `partial` (system auto-transitions)
- Terminal states: `confirmed`, `failed`, `rejected`, `cancelled` (wait user action)
- Retry/continue always flows through `partial` — single re-entry point
- Never add `is_*` booleans to encode state axes; extend the enum instead
- Example: lore entries use `enabled INTEGER` — should become `status TEXT` with `LoreEntryStatus { enabled, disabled, archived }` (lifecycle) while keeping `selective`, `case_sensitive`, `constant` as booleans (orthogonal flags)
- Guard transitions at the service boundary: read current status, call `machine.canTransition(from, to)`, return early on invalid moves rather than throwing deep in the DB layer. See `SyntheticGenerator.transitionStatus` + `syntheticDataStatusMachine` in `src/db/enums-story.ts` (generated → validated → approved/rejected → archived).
- Test: every state transition, every terminal state, every composite pair

### State Machine Application Points
Apply `StateDef` + `StateMachine` to any entity with lifecycle states:

| Entity | Current Pattern | Recommended State Machine |
|--------|----------------|--------------------------|
| Generation attempts | `GenerationStatus` enum (pending→processing→streaming→completed/failed/cancelled) | Already has enum; add `StateDef` for transition validation |
| Messages | `MessageStatus` + `MessageVisibility` (composite) | `CompositeValidator` for status×visibility pairs |
| Quests | `QuestStatus` (active→completed/failed/abandoned) | `StateDef` with terminal states |
| Synthetic data | `SyntheticDataStatus` (generated→validated→approved/rejected→archived) | ✅ Already wired via `syntheticDataStatusMachine` |
| Plugin lifecycle | `enabledMap` in registry (boolean toggle) | Consider `PluginStatus { active, disabled, error }` |
| World events | Implicit state in `WorldEvent` processing | Low priority — events are fire-and-forget |

## DB Access
- Kysely queries always use bind parameters (never string interpolation)
- Kysely Migrator for schema changes; migration = source of truth
- Test assertions against raw SQL inserts to catch migration drift

## Discriminated Unions for State Modeling
Use tagged unions instead of optional properties when an entity can be in one of several distinct states:

```ts
// ❌ Bad — "impossible states" (loading + error + data all true)
interface RequestState {
  loading?: boolean;
  error?: Error;
  data?: User[];
}

// ✅ Good — exactly one state at a time
type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: User[] }
  | { status: "error"; error: Error };
```

- Discriminator must be a common property with literal type (`status`, `type`, `kind`)
- TypeScript narrows automatically on `switch (state.status)` or `if (state.status === "success")`
- Each variant carries only the data relevant to that state
- Apply to: API responses, UI states, generation pipeline steps, event types

## Exhaustiveness Checking
Ensure all cases are handled in `switch` over discriminated unions or enums:

```ts
function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}

function handleStatus(status: GenerationStatus): string {
  switch (status) {
    case GenerationStatus.Pending: return "waiting";
    case GenerationStatus.Processing: return "active";
    case GenerationStatus.Streaming: return "active";
    case GenerationStatus.Completed: return "done";
    case GenerationStatus.Failed: return "error";
    case GenerationStatus.Cancelled: return "aborted";
    default: return assertNever(status); // Compile error if new case added
  }
}
```

- Extract `assertNever` into `src/utils.ts` — use in every switch over enum/union
- ESLint rule `@typescript-eslint/switch-exhaustiveness-check` enforces this globally
- Catches missing cases at compile time, not runtime
- Apply to: all `switch` on `GenerationStatus`, `MessageStatus`, `QuestStatus`, `ChatMode`, etc.

## Branded Types for ID Safety
Prevent primitive obsession — mixing up `userId`, `chatId`, `actorId` (all `string`):

```ts
type Brand<Base, Tag> = Base & { readonly __brand: Tag };

type UserId = Brand<string, "UserId">;
type ChatId = Brand<string, "ChatId">;
type ActorId = Brand<string, "ActorId">;

function getUser(id: UserId): Promise<User> { ... }

const userId = "usr_123" as UserId;
const chatId = "chat_456" as ChatId;
getUser(userId);  // ✅ ok
getUser(chatId);  // ❌ compile error
```

- Add `src/utils/brands.ts` with common branded ID types
- Use factory functions to create branded values from raw strings
- Apply to: route params (`/api/users/:id`), DB foreign keys, cross-service IDs
- Especially valuable when IDs pass through multiple layers (route → service → DB)

## Result Type Pattern
The codebase already uses `JsonResult<T>` — extend this pattern to all fallible operations:

```ts
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Usage in services
function parseConfig(raw: string): Result<Config, string> {
  const parsed = safeJsonParse<Config>(raw);
  if (!parsed.ok) return { ok: false, error: "Invalid config JSON" };
  // ... validate fields
  return { ok: true, value: parsed.value };
}

// Caller checks .ok — never throws
const config = parseConfig(dbRow.settings);
if (!config.ok) return jsonError({ message: config.error, status: 400 });
// config.value is fully typed
```

- `safeJsonParse`, `safeJsonStringify`, `jsonParseOr` already follow this pattern
- Extend to: config validation, asset metadata parsing, LLM response parsing
- Reserve exceptions for truly exceptional situations (DB connection lost, OOM)
- Expected failures (validation, parsing, auth) → Result type

## Async Hygiene
- Always `await` promises or `.catch()` explicitly
- No bare `.then()` waterfalls — `async/await` only
- Timeout all external calls (LLM, file uploads) with `AbortController`

## Allocation & Performance
- Chained `.map().filter().reduce()` allocates intermediate arrays (k·n memory). Use single `for..of` pass or single `.reduce()` for hot paths
- Pre-allocate result buffers when size is known: `new Array(len)` instead of repeated push
- In-place mutation (`.sort()`, `.splice()`, direct index assignment) preferred over creating new arrays for same-collection transforms
- Exception: readability wins for small/non-hot-path data (&lt;100 items, non-critical path) — keep chains legible

## Structured Logging
- Always use `getLogger()` from `src/logger/` — never `console.*` in production paths
- Create module-scoped children: `const log = getLogger().child({ module: "my-module" })`
- Log levels: `log.error(msg, error?)` for failures, `log.warn(msg, meta?)` for non-fatal, `log.info(msg, meta?)` for lifecycle events
- Fire-and-forget promises MUST have `.catch((err) => log.warn("description", err))` — never empty `.catch(() => {})`
- IIFE logging inside object literals: `(() => { const r = safeJsonStringify(x); if (!r.ok) { log.error("serialize failed", r.error); return null; } return r.value; })()`

## Input Validation Checklist (every new route handler)
- Required path params: check `typeof` + truthy before use
- Body destructuring: validate string enums against `Set(Object.values(Enum))` before casting
- Optional params: validate with `typeof param !== "undefined" && typeof param !== "string"` (or appropriate type)
- `parseBody()`: already returns `Response` on error — check `if (body instanceof Response) return body`
- `parsePagination()`: handles NaN/negative internally — use directly
- Ownership: verify `resource.created_by === userId` on every GET/PUT/DELETE by ID

## Safe JSON IIFE Pattern
When building DB row values that include serialized JSON:

```ts
settings: (() => { const r = safeJsonStringify(data); return r.ok ? r.value : "{}"; })(),
```

- Always provide a safe fallback (`"{}"`, `"[]"`, `null`)
- Log on failure: `if (!r.ok) { log.error("msg", r.error); return fallback; }`
- Never use bare `JSON.stringify()` in routes, services, or story modules

## LLM Generation
- Status tracked in `generation_attempts` table, not on message
- Message status reflects persistence + delivery, not generation pipeline
- `CancelReason` enum covers all abort causes (user, repetition, policy, limit, timeout, error)

## Testing
- Prefer raw SQL inserts in tests over fixtures (catches migration drift)
- Test edge states: every composite state pair, every transition
- `bun test` with Jest-compatible assertions

## Documentation
- Avoid embedding quantitative metrics (token counts, percentages, benchmark numbers) in `.agents/` docs
- Metrics go stale when code changes; they're never updated reliably
- Describe behavior qualitatively — "compresses aggressively" not "saves 46%"
- If metrics must appear, source them from automated CI output, not hand-maintained

## Agent References (this directory)
- `.agents/references/banned-patterns.md` — anti-patterns to reject in code review
- `.agents/references/recommendations.md` — preferred approaches to adopt
- `docs/meta/pattern-divergence.md` — quantified divergence audit (refresh per release)
- Loaded via AGENTS.md `cat` includes or skill `context_files` refs
- One-page each, concrete examples, project-specific

## Factory Pattern (preferred over separate interface + class)

### Problem
Separate `interface X { ... }` + `class XImpl implements X { ... }` forces:
- Duplicate imports at every call site (interface + constructor)
- Interface drift from implementation over time
- Extra maintenance surface (2 identifiers, 2 declarations)

### Solution: Factory function with inferred type

```ts
// ✅ Factory — single export, zero interface
export function createTaskRunner(db: Kysely<DB>, config: RunnerConfig) {
  const queue: string[] = [];

  async function run(taskId: string): Promise<Result> {
    // ...
  }

  function cancel(taskId: string): void {
    // ...
  }

  return { run, cancel };
}

export type TaskRunner = ReturnType<typeof createTaskRunner>;
```

Call site imports one thing, gets full type:

```ts
import { createTaskRunner, type TaskRunner } from "./task-runner";

const runner = createTaskRunner(db, config);
const result = await runner.run("task-1");
```

### Type inference: `ReturnType<typeof createXxx>`

```ts
// Consumer — no interface import needed
import { createWidget, type Widget } from "./widget";
import { type Kysely } from "kysely";

function handle(widget: Widget): void {
  console.log(widget.label);
}
```

### When to use (service/feature modules)
- Aggregate services with internal state (`GameMasterService` is candidate)
- Feature modules where single consumer exists
- Composables with multiple internal deps
- Any class that has exactly one implementation and no need for polymorphism

### When NOT to use (keep `interface` + `implements`)
- Polymorphic contracts with multiple implementations — keep `Logger`/`LLMProvider`/`Transport` interfaces
- Error classes — must extend `Error`
- Value objects / DTOs — plain interfaces are appropriate
- Cross-cutting contracts shared by 3+ implementations

### Existing codebase patterns
- `transport/factory.ts` — `createProtocol()` returns inferred handler
- `logger/index.ts` — `createLogger()` returns module-level singleton factory
- `middleware/rate-limit.ts` — `createRateLimiter()` factory
- `routes/entity-routes.ts` — `createEntityRoutes()` returns dispatch object
- `db/state.ts` — `createMachine()` returns state machine object
- `story/game-master.ts` — class candidate for factory refactor (single implementation, no polymorphic contract)
