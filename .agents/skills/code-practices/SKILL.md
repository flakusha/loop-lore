---
name: code-practices
description: >
  Use when an agent is about to refactor, add ESLint rules, tighten tsconfig,
  change test setup, touch plugin extension points, or split large modules in
  loop-lore. Maps the file/area being edited to the relevant research doc in
  docs/meta/code-practices-improvements/ and enforces the doc-vs-code
  precedence (AGENTS.md > src/ > docs/spec > docs/meta research).
version: 1.0.0
author: loop-lore contributors
license: Apache-2.0 OR MIT
metadata:
  agents:
    tags: [loop-lore, code-quality, eslint, tsconfig, testing, plugins, refactoring]
    related_skills: [loop-lore-context, loop-lore-db, loop-lore-tasks]
---

# Code Practices — Agent Integration Map

The 9 docs in `docs/meta/code-practices-improvements/` are **research**, not
current code. Before acting on any of them, confirm the current state in `src/`
and follow the precedence below. This skill exists so agents (Opencode, Hermes,
or any other) surface the right doc and don't build on the wrong assumption.

## Precedence (lower number wins)

1. `AGENTS.md` — conventions, the contract.
2. `.agents/references/banned-patterns.md` + `recommendations.md` — enforce in review.
3. `src/` actual code — runnable truth (`bun run check`).
4. `docs/spec/*` — aspirational; some describe unbuilt features.
5. `docs/meta/code-practices-improvements/*` — research, not-yet-implemented unless code matches.

## File / Area → Doc map

| You are editing…                              | Read doc                                  | Key caveat                                                                 |
| --------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| `tsconfig*.json`, `src/db/index.ts` casts     | `01-strict-typing.md`                     | `exactOptionalPropertyTypes` still off; DB wrapper `any[]` is the only escape |
| `eslint.config.mjs`, lint rules               | `02-eslint-and-static-analysis.md`        | **Mostly DONE**; complexity cap is `warn@20`, not `error`                  |
| `elysia-app.ts`, `server.ts` dispatch, routes | `03-extensibility-code-patterns.md`       | Dual dispatch still exists; plugin routes still linear-scanned             |
| `messages.ts`, `generate-route.ts`, `utils.ts`, `config/schema.ts`, `server.ts` | `04-code-organization-and-splitting.md` | These exceed 200L; split into `index.ts` barrels                  |
| `tests/e2e/helpers/server.ts`, `createTestDb` | `05-testing-e2e-multiple-db.md`          | Only SQLite tested; `createTestDb` now takes a `DialectFactory`            |
| `src/validation/schemas.ts`, request bodies  | `06-schemas-and-openapi.md`               | **Zod trap**: specs say Zod/`src/schemas/` — wrong; real is TypeBox       |
| `src/middleware/`, `elysia-app.ts` view serving, `config/schema.ts` frontend | `07-alternative-frontend-support.md` | No `frontend.mode`/CORS/negotiation yet                                |
| `src/plugins/*` (events, tools, ui, config)   | `08-plugins-hooks-integration.md`         | Event bus + tool executor **unwired**; `dispatchPluginRoute` still scans   |

## Hard rules for agents

- **Zod/TypeBox**: never add `src/schemas/` Zod files from the spec examples.
  New validation uses Elysia `t` (TypeBox) in `src/validation/schemas.ts`.
- **ESLint**: do not re-add rules already present (`consistent-type-definitions`
  is `error`, `no-misused-promises` is `error` server-side, `import/no-cycle`
  is `error`). Do not flip `cognitive-complexity` to `error` until the
  oversized handlers are split — it would break `bun run check`.
- **Type coverage**: floor raised to 90% (backend 96.88%, frontend 92.20%).
  Do not regress below 90.
- **File size**: `scripts/check-file-size.ts` warns >250L (non-blocking). Split
  files over 200L into `index.ts` barrels.
- **Tests**: `createTestDb(dialectFactory?)` now supports a Postgres factory
  behind `TEST_DB=postgres`. Add dialect coverage there, don't fork it.

## Enforcement gate

Before reporting done: `bun run check && bun test src/`. Fix every ESLint
**error**; refactor rather than disable rules. See `AGENTS.md` →
"Agent Enforcement Contract".
