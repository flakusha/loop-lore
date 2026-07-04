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

## `any` type escape hatches
Violation: `(x as any).foo` or `function f(x: any)`.
Fix: Strong types, generics, or `unknown` with type guard.
Rationale: `any` disables typechecking for entire expression. `unknown` forces validation.

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
