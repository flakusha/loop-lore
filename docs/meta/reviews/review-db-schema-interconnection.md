# DB / Schema / Application Type Interconnection Review

## Architecture Overview

```
src/db/
  enums.ts              → barrel (re-exports enums-core, enums-content, enums-generation, enums-story, enums-config)
  schema.ts             → barrel (re-exports schema-core, schema-content, schema-generation, schema-story, schema-synthetic)
                         + DB aggregate interface (all table names → interface)
  enums-core.ts         → UserRole, ChatType, ChatMode, ActorType, AgentType, MessageRole, ...
  enums-content.ts      → AssetType, StorageBackend, ContentEncoding
  enums-generation.ts   → GenerationStatus, CancelReason, CancelSource, ChunkAction, PolicyType, ...
  enums-story.ts        → TurnType, TurnStatus, QuestType, QuestStatus, GameMasterType, WorldEventType, ...
  enums-config.ts       → DbType, LogLevel, AgeGateMode
  schema-core.ts        → Users, Sessions, Chats, Actors, ChatParticipants, Characters, Messages
  schema-content.ts     → Assets, AssetLinks
  schema-generation.ts  → GenerationAttempts
  schema-story.ts       → Worlds, Locations, StoryTurns, Quests, QuestProgress, WorldStates, NpcStates,
                          LocationStates, Items, WorldItems
  schema-synthetic.ts   → SyntheticData

src/generation/         → imports DB types + enums, defines domain types, cancellation, continuation, pipeline
src/story/              → imports DB types + enums, defines domain types, turn manager, quest engine, world state
```

Enum values flow: `src/db/enums-*.ts` → `src/db/enums.ts` (barrel) → domain packages
Schema types flow: `src/db/schema-*.ts` → `src/db/schema.ts` (barrel + DB aggregate) → domain packages

Every domain package imports enums as **runtime values** (for DB inserts/updates) and as
**type-only** imports (for interface fields), using the same const-object + type-union pattern.

---

## ✅ Strong Points

### 1. Domain-grouped schema files
`schema-core.ts`, `schema-generation.ts`, etc. give each domain ownership of its tables.
The barrel in `schema.ts` is minimal — just re-exports + the `DB` aggregate.

### 2. Single enum source of truth
All 30+ enum values live in `src/db/enums-*.ts`. A domain package never hardcodes a string
literal for a DB field — it always imports `GenerationStatus`, `CancelReason`, etc.

### 3. Domain types are decoupled from DB types
Generation has three type files (`gen-types-options`, `gen-types-results`, `gen-types-api`)
with zero DB dependencies — pure domain interfaces. Only `GenerationAttemptRow = Selectable<GenerationAttempts>`
bridges the two worlds, and it's used in exactly one place (`step-pipeline.ts`).

### 4. Clean barrel hierarchy
```
types.ts              → gen-types-options + gen-types-results + gen-types-api
cancellation-manager.ts → cancellation-tracker + cancellation-actions
index.ts              → types + cancellation-manager + continuation + step-pipeline + repetition-detector + policy-detector
```

No circular dependencies. Everything flows through barrels.

### 5. Consistent error handling in routes
`jsonError(message, status)` + `jsonResponse(data, status)` with proper HTTP codes
(400, 404, 422, 500). Every route handler returns a `Response` object.

### 6. Pluggable policy detection
`registerPolicyDetector()` interface — no hardcoded keyword lists. Default `NullDetector`
means no third-party dependencies at startup. Detector failures are caught individually
and don't cascade.

### 7. CancellationError class
`GenerationCancelledError` extends `Error` with typed `reason: CancelReason`,
`source: CancelSource`, `detail: string` — structured error data that callers can
discriminate on rather than parsing a string.

---

## ⚠️ Issues Found

### Issue 1: `as` casts in route handlers bypass type safety

`src/generation/generation-routes.ts` casts every request body from `unknown`:

```typescript
// Line 40: casts unknown to Record<string, unknown>
const input = body as Record<string, unknown>;

// Line 42-43: casts unknown strings to enum types
const reason = input.reason as CancelReason ?? CancelReason.UserCancel;
const source = input.source as CancelSource ?? CancelSource.User;

// Line 124: casts unknown to typed interface (zero validation)
const input = body as RetryFromPointRequest;

// Line 183: same pattern
const input = body as ContinueRequest;
```

These are unavoidable to cross the HTTP boundary, but they skip all validation.
A malformed request that passes the if-checks will generate garbage queries, not
compile errors. **Recommendation**: add Zod schemas for request validation, or at
minimum runtime type guards (`isContinueRequest(x): x is ContinueRequest`).

### Issue 2: `as` cast from DB query to typed row

`src/generation/step-pipeline.ts` line 105:

```typescript
.executeTakeFirst() as GenerationAttemptRow | undefined;
```

Kysely with `<DB>` generic returns `unknown` on the full-generic `selectAll()`.
The cast is required but is unchecked — if the migration and schema.ts drift,
this cast hides the mismatch. **Recommendation**: use `.select(["step_index", "total_steps", "status"])`
with explicit column list instead of `selectAll()`, which gives Kysely enough
type info without the cast.

*(Same pattern applies to `cancellation-actions.ts` line 99 and `generation-routes.ts` line 192 —
`selectAll()` then `as`.)*

### Issue 3: Fire-and-forget DB writes mask failures

`src/generation/cancellation-tracker.ts`: 7 occurrences of `void ... .catch(() => {})`:

```typescript
// Line 185 — attempt insert
void insertAttempt(db, options, attemptId, abortSignalId).catch(() => {});
// Line 190 — status update to Processing
void updateAttemptStatus(db, attemptId, GenerationStatus.Processing).catch(() => {});
// Same pattern in cancellation-actions.ts lines 73, 138, 151, 176, 208
```

When the DB write fails, the in-memory `activeGenerations` map still holds the
state — but the DB row is missing or has a stale status. On restart, the in-memory
state is lost and the DB shows `pending` when it should show `processing` or
`cancelled`. **Recommendation**: at minimum log the error; ideally make the
persistence a hard requirement before the in-memory state is updated.

### Issue 4: Policy config type erasure in ActiveGeneration

`src/generation/cancellation-tracker.ts` line 36:

```typescript
policyConfig: { expectedPolicy: string; cancel: boolean };
```

This discards the `PolicyType` union type. The value is then cast back at
use-site in `cancellation-actions.ts` line 187:

```typescript
expectedPolicy: active.policyConfig.expectedPolicy as PolicyType,
```

**Recommendation**: type `expectedPolicy` as `PolicyType` directly.

### Issue 5: Silent JSON parse failure in controller

`src/generation/controller.ts` lines 36, 53, 59, 65:

```typescript
const body = await request.json().catch(() => ({}));
```

A malformed JSON body becomes `{}`, which passes the if-checks only to fail
with a generic error like "chatId is required" — the user has no idea their
JSON was malformed. **Recommendation**: return a 400 with the parse error.

### Issue 6: Schema types missing documented columns

`src/db/schema-story.ts` `Worlds` is missing `scan_depth` and `token_budget`
(documented in `docs/actors.md` and the migration strategy).

`src/db/schema-core.ts` `Actors` is missing character-card columns:
`data_version`, `welcome_message`, `personality`, `scenario`, `mes_example`,
`alternate_greetings`, `post_history_instructions`, `creator_notes`, `creator`,
`character_version`, `import_spec` (all documented in `docs/actors.md`).

These columns exist on paper but have no corresponding TypeScript interface.
Any code that tries to read or write them gets no type-checking.

### Issue 7: NpcStates lacks `created_at` column

Every other table has `created_at` with `DEFAULT CURRENT_TIMESTAMP`.
`NpcStates` (schema-story.ts) only has `updated_at`.

### Issue 8: Undefined-safe optional chaining in continuation.ts

`src/generation/continuation.ts` line 40:

```typescript
if (attempt?.partial_content) {
```

`attempt` is typed as `{ partial_content: string | null } | undefined` from the
DB query — the `?.` handles undefined, but the `if (...)` is truthy-checking.
A returned empty string `""` would be falsy and skip the store, even though
the DB has the value. **Recommendation**: check `attempt` existence separately
from `partial_content`:

```typescript
if (attempt && attempt.partial_content !== null) {
```

---

## Recommendations Summary

| Priority | Issue | Fix |
|----------|-------|-----|
| **High** | `as` casts on request bodies (3 sites) | Add Zod schemas or type guards for ContinueRequest, RetryFromPointRequest |
| **High** | Fire-and-forget DB writes (7 sites) | Log failures, make critical writes (start, complete) await |
| **High** | Missing schema columns (Actors, Worlds) | Add character-card fields to `schema-core.ts` Actors; add scan_depth/token_budget to `schema-story.ts` Worlds |
| **Medium** | `selectAll()` + `as` cast (3 sites) | Use explicit `.select([...])` for typed results |
| **Medium** | Silent JSON parse error (4 sites) | Return 400 with parse error message |
| **Medium** | Policy config type erasure | `expectedPolicy: PolicyType` instead of `string` |
| **Low** | NpcStates missing `created_at` | Add column for consistency |
| **Low** | Truthy check on DB string | Use `!== null` instead of falsy check |