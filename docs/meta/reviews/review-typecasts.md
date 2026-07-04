# Typecast Review

All `as` casts found in `src/`, grouped by class. Review evaluates whether each
is avoidable and what ESLint rules guard (or fail to guard) them.

---

## 1. HTTP boundary — `body as T` (6 sites)

| File                                     | Cast                                  | Avoidable?                                                                                                                |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `generation/generation-routes.ts:40,261` | `body as Record<string, unknown>`     | No — `request.json()` returns `unknown`, the catch is legitimate.                                                         |
| `generation/generation-routes.ts:42,43`  | `input.reason as CancelReason`        | Partially — the string has no guarantee it's a valid CancelReason. A runtime check before the cast would catch bad input. |
| `generation/generation-routes.ts:124`    | `body as RetryFromPointRequest`       | **Yes — this is the riskiest cast in the codebase.** It skips all validation. A Zod schema would both validate and type.  |
| `generation/generation-routes.ts:183`    | `body as ContinueRequest`             | **Same** — zero validation, the handler accesses fields that may not exist.                                               |
| `age-gate/controller.ts:80,133`          | `body as Record<string, unknown>`     | No — same HTTP boundary pattern.                                                                                          |
| `age-gate/controller.ts:147,150`         | `input.mode as AgeGateConfig["mode"]` | Partially — needs enum membership check.                                                                                  |

**ESLint coverage**: `@typescript-eslint/no-unsafe-argument` (from strictTypeChecked)
catches when the cast result is passed unsafely. But no rule catches _that a cast
exists_ — the grammar of `as` is intentional by the author. `no-unnecessary-type-assertion`
is active but doesn't fire because the input is legitimately `unknown`.

---

## 2. JSON.parse → typed cast (9 sites)

| File                           | Cast                                                    | Avoidable?                                                                                                      |
| ------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `story/turn-manager.ts:65`     | `JSON.parse(chat.story_state) as TurnManagerState`      | Not at this level — JSON.parse always returns `any`. A Zod schema on the stored JSON would validate _and_ type. |
| `story/quest-engine.ts:235`    | `JSON.parse(quest.config) as QuestConfig`               | Same pattern — serialization boundary.                                                                          |
| `story/quest-engine.ts:384`    | `JSON.parse(quest.narrative_hooks) as Array<...>`       | Same.                                                                                                           |
| `story/quest-engine.ts:431`    | `JSON.parse(rewardsJson) as QuestReward`                | Same.                                                                                                           |
| `story/world-state.ts:123-126` | `JSON.parse(npcRow.knowledge) as NpcState["knowledge"]` | Same. 4 per-field casts for different JSON columns in the same row.                                             |

**Pattern**: JSON is stored as TEXT in SQLite (no native JSON type). Every read
requires parse + cast. **Not avoidable** without a validation layer, but a
`parseJSON<T>(raw: string | null, validator: (x: unknown) => x is T)` helper
could reduce boilerplate and add runtime validation.

**ESLint coverage**: `no-unsafe-type-assertion` from strictTypeChecked flags
unsafe downcasts — but `JSON.parse(...)` returns `any`, and casting `any` to
anything is always "safe" from TS's perspective (any bypasses the checker).
**No rule catches this pattern.**

---

## 3. `as any` (4 sites)

| File                           | Cast                  | Reason                                                                                                    |
| ------------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------- |
| `story/items.ts:144,275`       | `} as any)`           | Kysely strict inference workaround — the `DB` generic can't handle deeply nested `.values({...})` shapes. |
| `story/world-state.ts:210,241` | `} as any)`           | Same Kysely workaround in different files.                                                                |
| `db/index.ts:42,44,47`         | `parameters as any[]` | Bun SQLite dialect adapter — `as any[]` is suppressed with eslint-disable. Necessary.                     |

**ESLint coverage**: `@typescript-eslint/no-explicit-any` is NOT set to `error`
in the main config (it's only disabled in test files). If it were enabled, these
would all fire. The current config has:

- Test files: `@typescript-eslint/no-explicit-any: "off"` ✅
- Main files: **no explicit setting** — inherits from `strictTypeChecked` which
  sets it to `warn` by default

**Recommendation**: set `@typescript-eslint/no-explicit-any` to `"error"` in the
main config, then selectively suppress the 4 known Kysely workaround sites with
`eslint-disable-next-line` comments (as db/index.ts already does).

---

## 4. `as unknown as T` double casts (6 sites)

| File                                 | Cast                                       | Reason                                                                       |
| ------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `config/load.ts:93,102`              | `result as unknown as Config`              | Deep merge returns `unknown` — the final cast asserts the full Config shape. |
| `config/load.ts:97`                  | `config as unknown as Record...`           | Internal type fiddling during env-var override resolution.                   |
| `config/load.ts:154`                 | `config as unknown as Config` (×2)         | Final merge result.                                                          |
| `config/load.test.ts:153,162`        | `config as unknown as Record...`           | Test casting for mutation.                                                   |
| `generation/continuation.test.ts:59` | `new Kysely(...) as unknown as Kysely<DB>` | Test workaround for BunSqliteDialect mocking.                                |
| `middleware/pipeline.ts:67`          | `_context as unknown as Record...`         | Middleware context access before typed propagation.                          |

**Pattern**: `as unknown as T` is the "I know the shape" escape hatch. The
production code (config/load.ts) could use Zod to validate the final shape and
avoid the double cast. The test singles are acceptable.

**ESLint coverage**: none — `consistent-type-assertions` controls syntax (`as`
vs `<>`) but not existence.

---

## 5. Kysely `status as GENUM` column casts (3 sites)

| File                   | Cast                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `step-pipeline.ts:113` | `attempt.status as GenerationStatus`                        |
| `world-state.ts:89`    | `q.type as StoryContext["activeQuests"][0]["type"]`         |
| `world-state.ts:153`   | `t.turn_type as StoryContext["recentTurns"][0]["turnType"]` |

Kysely's `<DB>` generic types `status` as `string` (the stored DB value) not as
the TypeScript enum union. The cast bridges the gap. **Unavoidable** without
Kysely DB-level enum typing (which doesn't exist in SQLite).

**ESLint coverage**: `no-unsafe-type-assertion` should fire here because casting
`string` to `GenerationStatus` is a downcast. It _technically_ does in strict
mode — but it's a `warn`, not an `error`.

---

## 6. `as never` Kysely array workarounds (4 sites)

| File                               | Cast                                 | Reason                                                                                                                                                 |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `world-state.ts:189`               | `["character", "narrator"] as never` | Kysely's `where("col", "in", [...])` inference rejects string tuples when the column type is an ActorType union. `as never` bypasses strict inference. |
| `world-state.ts:190`               | `["ai", "npc"] as never`             | Same pattern.                                                                                                                                          |
| `age-gate/service.test.ts:215-218` | `parameters as never[]`              | Test mock for Bun SQLite dialect.                                                                                                                      |

**Avoidability**: These are Kysely strict-mode friction points. The `as never`
pattern is the least-bad option (narrower than `as any[]`). No ESLint rule
catches it because `never` is technically valid in any position.

---

## 7. `catch (error) ... error as Error` (6 sites)

Every catch block converts the typed `unknown` catch parameter to `Error`:
scattered across controller.ts, policy-detector.ts, age-gate/controller.ts, etc.

**Avoidability**: No — TypeScript correctly types catch params as `unknown`.
A `toError(error: unknown): Error` utility could centralize the pattern.

**ESLint**: `strictTypeChecked` warns about `(error as Error).message` via
`no-unsafe-member-access`, but it's suppressing with the cast.

---

## 8. Bun API type casts (3 sites — zstd)

`src/content/{compress,decode,encode}.ts` all cast `Bun.zstdCompressSync` /
`Bun.zstdDecompressSync` to a narrower function signature that accepts `Buffer`
instead of `Uint8Array | Buffer`. This is Bun's API surface being wider than
our usage.

**Avoidability**: A typed wrapper function `zstdCompress(buffer: Buffer)` would
contain the cast in one place instead of three.

---

## Summary

| Class                          | Count              | Risk                            | ESLint catches?                               |
| ------------------------------ | ------------------ | ------------------------------- | --------------------------------------------- |
| HTTP boundary `as RequestType` | 2 sites (124, 183) | **High** — zero validation      | No rule checks that body casts are validated  |
| `as any` production code       | 4 sites            | Medium — Kysely workaround      | `no-explicit-any` set to `warn` (not `error`) |
| `as never` Kysely arrays       | 2 sites (non-test) | Low — narrowest possible escape | No rule                                       |
| JSON.parse `as T`              | 9 sites            | Medium — malformed JSON = crash | No rule (JSON.parse returns `any`)            |
| `as unknown as T`              | 6 sites            | Low — config/test boundaries    | Double cast, no rule                          |
| Kysely enum column `as`        | 3 sites            | Low — type string→union bridge  | `no-unsafe-type-assertion` warns              |
| Bun API `as`                   | 3 sites            | Low — in zstd wrapper files     | No rule                                       |
| catch-param `as Error`         | 6 sites            | None — legitimate               | `no-unsafe-member-access` warns               |

## Recommendation

1. **Enable `@typescript-eslint/no-explicit-any: "error"`** in the main config.
   The 4 `as any` sites are already suppressible with eslint-disable (db/index
   already does this). This catches any new `as any` creeping in.

2. **Add Zod** for the 2 high-risk HTTP body casts (`RetryFromPointRequest`,
   `ContinueRequest`). These are the only casts where incorrect data reaches
   the DB without validation.

3. **Add a `parseJSON<T>` helper** — wraps `JSON.parse` with a runtime type
   guard. Covers the 9 JSON.parse sites with one utility.
