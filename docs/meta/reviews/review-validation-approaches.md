# In-Code Validation Approaches

Survey of what exist in the codebase today and what approaches are available
for eliminating `as` casts through validation.

---

## Current State

The project has **zero runtime validation libraries** in its dependencies.
The only validation is ad-hoc:

| Function                         | File                   | Approach                                             |
| -------------------------------- | ---------------------- | ---------------------------------------------------- |
| `validateConfig()`               | `config/load.ts`       | Manual field-by-field checks + throw                 |
| `validateAge()`                  | `age-gate/service.ts`  | Parse date + comparison + throw (typed errors)       |
| `validateEvents()`               | `story/events.ts`      | Cross-reference against DB state                     |
| `.filter((f): f is string => …)` | `db/migrate.ts`        | One-off type predicate                               |
| `jsonValidationError()`          | `routes/http-utils.ts` | Response builder — **plumbing exists but is unused** |

The response utilities already have `jsonValidationError()` and `ApiError` types.
The missing piece is the **parse side**: a function that takes `unknown` and
returns either typed data or validation errors.

---

## Approach 1: Type Guard Functions (zero deps)

A type guard is a function that returns `x is T`. TS narrows the type at the
call site — no `as` cast needed.

```typescript
function isContinueRequest(body: unknown): body is ContinueRequest {
  const x = body as Record<string, unknown>; // one unavoidable cast
  return (
    typeof x.messageId === "string" &&
    typeof x.chatId === "string" &&
    typeof x.actorId === "string" &&
    (x.modelId === undefined || typeof x.modelId === "string") &&
    (x.provider === undefined || typeof x.provider === "string")
  );
}

// Usage — the `as` cast moves from the handler to the guard, where it's contained
const body = await request.json();
if (!isContinueRequest(body)) {
  return jsonValidationError([{ field: "body", message: "Invalid continue request" }]);
}
// body is now ContinueRequest — no cast needed below
```

**Pros**: Zero dependencies, simple, idiomatic TS. The `as` cast is contained
inside one function instead of scattered at every call site.

**Cons**: Boilerplate for complex nested shapes. No error messages about _which_
field failed. No composition — each guard is hand-written.

**Best for**: request shapes with 3–5 flat fields (`ContinueRequest`,
`RetryFromPointRequest`, `ConfigureStoryRequest`).

**What it would eliminate**: 2 `as` casts in `generation-routes.ts` (lines 124, 183)

- 4 `input.field as EnumType` casts (lines 42–43, 147, 150).

---

## Approach 2: Zod schemas (external lib)

[Zod](https://zod.dev/) is the standard TS validation library. It does runtime
parsing AND type inference — a single schema defines validation + the TypeScript
type, eliminating the interface entirely.

```typescript
import { z } from "zod";

// One schema = validation + type, no separate interface needed
const ContinueRequestSchema = z.object({
  messageId: z.string().uuid(),
  chatId: z.string().uuid(),
  actorId: z.string().uuid(),
  modelId: z.string().optional(),
  provider: z.string().optional(),
});
type ContinueRequest = z.infer<typeof ContinueRequestSchema>;

// Usage — parse returns typed data or throws ZodError
export async function handleContinueGeneration(body: unknown): Promise<Response> {
  const parsed = ContinueRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonValidationError(
      parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    );
  }
  // parsed.data is ContinueRequest — fully typed
}
```

**What Zod handles** that type guards don't:

| Feature                              | Type guard               | Zod                      |
| ------------------------------------ | ------------------------ | ------------------------ |
| Nested validation                    | Manual                   | Declarative              |
| Per-field error messages             | Manual                   | Automatic                |
| Enum membership                      | `enumValues.includes(x)` | `z.nativeEnum(EnumType)` |
| `.uuid()`, `.email()`, `.url()`      | Manual regex             | Built-in                 |
| Type inference                       | Separate interface       | `z.infer<>`              |
| Transformation (string→number, etc.) | Manual                   | `.pipe()`                |

**Downside**: Adds to bundle size (minified, brotli-compressed).
The project already has `js-yaml` and `smol-toml` — `zod` is comparable in size.

**What it would eliminate**: All 6 HTTP boundary `as` casts + the 4 `.reason as EnumType`
casts + the `body as Record` casts. Also eliminates the `JSON.parse as T` pattern
if JSON columns are parsed through Zod.

---

## Approach 3: Branded types (zero deps, compile-time only)

Branded types prevent mixing up primitives at compile time with zero runtime cost:

```typescript
type UUID = string & { readonly __brand: "UUID" };

function createUUID(value: string): UUID {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid UUID: ${value}`);
  }
  return value as UUID; // single cast in the factory
}
```

Then `chatId: UUID` instead of `chatId: string` in interfaces — the compiler
catches if you pass a bare string where a UUID is expected.

**Pros**: Zero bundle cost, catches bugs at compile time.
**Cons**: Adds friction — you must call factories at every boundary. Doesn't
help with the HTTP `body as T` problem (you still need to validate the boundary).

**Best for**: identifier types (UUID, Slug, DateString) that propagate through
the system and benefit from compile-time sanity checks.

---

## Approach 4: Parse helper for JSON TEXT columns (zero deps)

A utility that wraps `JSON.parse` with a type guard, confining the `as` cast:

```typescript
function parseJSON<T>(raw: string, guard: (x: unknown) => x is T): T {
  const parsed: unknown = JSON.parse(raw);
  if (!guard(parsed)) {
    throw new TypeError(`JSON parse guard rejected value`);
  }
  return parsed; // T — no cast needed at call site
}

// Example guard for a known shape
function isQuestConfig(x: unknown): x is QuestConfig {
  if (typeof x !== "object" || x === null) return false;
  const c = x as Record<string, unknown>;
  return typeof c.type === "string";
}
```

The 9 `JSON.parse(...) as T` sites collapse to `parseJSON(row.config, isQuestConfig)`.

**Note**: This only makes sense if the guard is shared across sites. If each
call has a one-off guard, the boilerplate isn't worth it. With Zod, this
becomes `QuestConfigSchema.parse(JSON.parse(row.config))`.

---

## Approach 5: Kysely query helper for strict inference (zero deps)

The `as any` casts for Kysely's `.values({})` are caused by strict inference on
the full `DB` generic — Kysely requires every non-nullable field to be present.
A typed insert helper encapsulates the cast:

```typescript
function insertRow<T extends Record<string, unknown>>(db: Kysely<DB>, table: keyof DB, values: T) {
  return (db.insertInto(table as string) as unknown as { values(v: T): ReturnType<typeof db.insertInto> })
    .values(values)
    .execute();
}
```

Or more practically, narrow the generic instead of using `DB`:

```typescript
await db
  .insertInto("items")
  .values({
    id: uuid,
    world_id: worldId,
    name: item.name,
    ... // without the full DB generic, inference is tighter
  })
  .execute();
```

The `as any` in `world-state.ts:210` and `items.ts:144,275` are specifically
Kysely + `DB` generic friction. Using `.select(...)` with explicit columns
(already done in step-pipeline.ts) is the pattern to follow.

---

## What to use where

| Cast class                                       | Count       | Recommended approach                                                                 | Effort  |
| ------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------ | ------- |
| HTTP boundary `body as ContinueRequest` (2)      | High risk   | **Type guard functions** first (0 deps). Evolve to Zod later.                        | 1 day   |
| HTTP boundary `input.reason as CancelReason` (4) | Medium risk | **Zod `z.nativeEnum()`** or simple type guard with `Object.values()` check           | 0.5 day |
| JSON.parse `as T` (9)                            | Medium risk | **Zod schemas** for QuestConfig, TurnManagerState, NpcState shapes                   | 1 day   |
| `as any` Kysely workaround (4)                   | Low risk    | **Narrow the generic** or use typed insert helper. ESLint catch + suppress           | 0.5 day |
| `as never` Kysely arrays (2)                     | Low risk    | Keep — narrowest possible escape. No alternative without loosening Kysely inference. | —       |
| Bun API zstd casts (3)                           | Low risk    | **Typed wrapper** function per zstd operation                                        | 0.5 day |
| `as unknown as T` config (4)                     | Low risk    | Evolve to Zod when config schema stabilises                                          | —       |
| Kysely enum column `as` (3)                      | Low risk    | Keep — Kysely bridge, not avoidable without DB-level enums                           | —       |

## Quickest path to impact

1. **Write type guards** for `ContinueRequest` and `RetryFromPointRequest` in
   `generation-routes.ts` — eliminates the 2 highest-risk casts. These shapes
   are small (3–5 flat fields), making guards trivial.

2. **Add enum membership checks** alongside the `reason as CancelReason` /
   `source as CancelSource` casts. `Object.values(CancelReason).includes(x)`
   before the cast turns a blind assertion into a validated one.

3. **Enable `@typescript-eslint/no-explicit-any: "error"`** and suppress the
   4 known `as any` sites with eslint-disable comments — prevents any new ones.

4. **Consider Zod** when the first schema changes happen. The existing
   `jsonValidationError()` pattern means the response side is already wired.
