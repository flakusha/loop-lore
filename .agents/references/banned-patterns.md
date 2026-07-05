# Banned Coding Patterns

## Boolean-flag columns (`is_active`, `is_hidden`, `has_*`)
Violation: `is_active INTEGER`, `is_deleted INTEGER`, `is_hidden INTEGER` in schema.
Fix: Use enum column + status machine. `users.status TEXT`, `items.visibility TEXT`.
Rationale: Booleans don't scale — new states require migration + code changes. Enums extend without schema churn.

## Numeric status codes (`status = 0 | 1 | 2`)
Violation: `status INTEGER` with magic numbers in code.
Fix: Use string enum via `StateDef`. 
Rationale: Magic numbers are opaque. String enums self-document in DB queries and logs.

## Comments in production code
Violation: `// this loops over items` or `/* purpose of X */`.
Fix: No comments. Code expresses intent. JSDoc on public exports only.
Rationale: Comments rot. If code needs explanation, rename/extract.

## `I` prefix on interfaces (`IUserService`, `IChatRepo`)
Violation: Hungarian-style interface naming.
Fix: `UserService`, `ChatRepo` (class or interface). Prefix discriminates nothing.
Rationale: TypeScript structural typing makes `I` pointless noise.

## Bare `.then()` chains
Violation: promise.then(v => ...).then(v => ...).catch(...)
Fix: `async/await` with try/catch.
Rationale: `.then()` waterfalls obscure flow. `async/await` linearizes.

## Importing DB modules in service/controller layers
Violation: `import { db } from "../db/sqlite-adapter"` in service code.
Fix: Import Kysely types + `db` instance only. Never raw driver.
Rationale: Kysely isolates dialect swaps (SQLite ↔ PG). Raw driver import breaks swap.

## `||` for default values (falsy trap)
Violation: `const name = input.name || "default"`.
Fix: `input.name ?? "default"`.
Rationale: `||` swallows `""`, `0`, `false`. Nullish coalescing targets null/undefined only.

## Type casts (`as ...`) — last resort
Violation: `value as SomeType`, `value as any`, `x as unknown as Y`, or `function f(x: any)`.
Fix: Proper type narrowing, generics, branded types, or type guards (`is`, `satisfies`). `as any` only when crossing serialization boundary (JSON.parse, file read) and wrapped in a validation function (<5 lines).
Rationale: `as` supresses typechecker — both backend and frontend. `as any` disables it entirely. Casts mask real type mismatches that surface at runtime. `satisfies` validates shape without widening. Type guards narrow safely. Applies equally to server (`src/routes/`, `src/db/`) and frontend types (`src/public/`, `src/views/`).

## Direct `express`-style middleware passing
Violation: `app.use(handler)` patterns.
Fix: `compose([errorBoundary, authenticate], routeHandler)` pipeline.
Rationale: Project uses hand-rolled pipeline composable, not Express.

## Silent catch blocks
Violation: `catch (e) {}` or `catch { /* ignore */ }`.
Fix: Log, rethrow, or return error response. At minimum `console.error`.
Rationale: Silent swallows hide bugs in production.

## AI SDK wrappers for LLM calls
Violation: `import OpenAI from "openai"` or `import ai from "@ai-sdk/openai"`.
Fix: Native `fetch()` to provider API + project's own retry/backoff.
Rationale: No AI SDK dependency. Own abstraction layer in `src/generation/`.

## CSS-in-JS or JSX
Fix: htmx + Alpine.js templates. Plain CSS files. No React/Vue/Svelte.
Rationale: Tech stack constraint. See AGENTS.md.

## Bare `JSON.parse()`/`JSON.stringify()` in production code
Violation: `JSON.parse(dbField)`, `JSON.stringify(complexData)` in routes, services, or story modules.
Fix: Use `safeJsonParse<T>()`, `jsonParseOr(field, fallback)`, or `safeJsonStringify(value)` from `src/utils.ts`.
Rationale: JS/TS has no checked exceptions — `JSON.parse` throws on malformed input (crash risk with DB data). `JSON.stringify` throws on circular refs, BigInt, `undefined` in arrays (silent data loss or crash). Safe variants return `JsonResult<T>` discriminated union — never throw, explicit `.ok` check. `jsonParseOr` provides one-liner fallback for DB fields.

## Allocation-heavy chain methods in hot paths
Violation: `items.map(f).filter(g).map(h).reduce(r, init)` in request handlers, generation pipelines, loops processing 1000+ items, or any O(n) function called per-request.
Fix: Single `for..of` pass with combined transform/filter logic, or single `.reduce()` accumulating transformed + filtered results. Pre-allocate result array when size is known (`new Array(len)`). Use in-place mutation (`splice`, index assignment) for same-collection edits.
Rationale: Each chain link allocates a full intermediate array (k·n memory). GC pressure scales linearly with input size and chain length. Single pass is O(n) memory, O(n) time. Chained is O(n) time but O(k·n) allocation — multiplies GC cost for zero semantic benefit. Exception: chains on tiny arrays (&lt;100 items, non-critical path) where readability justifies allocations.
