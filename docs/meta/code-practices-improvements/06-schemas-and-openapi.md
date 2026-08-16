<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# 06 — Schemas Export & OpenAPI

## Current state

- **Validation uses Elysia `t` (TypeBox)**, not Zod. `src/validation/schemas.ts`
  (≈11 KB) centralizes `t.Object`/`t.UnionEnum` definitions, re-used by the
  migrated Elysia route modules for request validation.
- **`src/schemas/` does NOT exist.** `docs/spec/implementation.md` and
  `docs/spec/api-routes.md` describe a **Zod** layer in `src/schemas/` with
  per-route companion `.schema.ts` files and `z.infer<>` types — this is
  **not implemented**. The Zod + OpenAPI migration lives only as a _plan_ in
  `docs/meta/integration-testing-tools.md`.
- **No OpenAPI document is produced.** There is no `/openapi.json` and no
  Swagger UI. The plan notes `@elysiajs/swagger` would require "a complete
  server rewrite" because routes use closure injection + a catch-all rather
  than schema-attached Elysia route definitions.
- **DB schema is not exported** for external consumers. Kysely `DB` types are
  internal; there is no generated TS SDK or typed client.

## Gaps

1. **Docs contradict code** on the validation stack (Zod vs TypeBox). Anyone
   extending validation will build on the wrong assumption.
2. **No machine-readable API contract.** Alternative frontends (`07`),
   contract tests (`05`), and SDK generation have nothing to consume.
3. **TypeBox `t` can't easily emit OpenAPI** without Elysia's Swagger plugin,
   which the current routing shape blocks.
4. **DB types are opaque externally** — integrators must reverse-engineer
   the API to model entities.

## Recommendations

1. **Reconcile the docs first** (`docs/spec/implementation.md`,
   `docs/spec/api-routes.md`): state the real stack (TypeBox `t` today) and
   mark Zod as a proposed migration. Do not let new code copy the doc's
   Zod examples.
2. **Adopt the planned Zod migration** (`docs/meta/integration-testing-tools.md`
   already scopes it: ~2-3d for Zod, ~1d for `@asteasolutions/zod-to-openapi`).
   Single source of truth = Zod schema = TS type (`z.infer`) = runtime
   validation = OpenAPI component. Migration is **additive**: replace
   `parseBody()` with `schema.safeParse()`; existing Elysia `t` schemas can
   stay during transition.
3. **Create `src/schemas/`** with domain-grouped files
   (`chats.ts`, `messages.ts`, `actors.ts`, `shared.ts`) — the structure the
   docs already promise. Export a `registry` of named schemas.
4. **Generate OpenAPI** with `@asteasolutions/zod-to-openapi`: build a
   `registry`, register each route's request/response schemas, and serve
   `/openapi.json` + Swagger UI at `/api/docs`. This also unblocks `05`
   contract tests and `07` SDK generation.
5. **Export the DB schema for SDK consumers.** For Postgres, Kysely
   introspection can emit a typed schema; for SQLite, hand-maintain a
   `src/db/export/types.ts` barrel (the existing `schema-*.ts` interfaces are
   already well-factored — just re-export them as a public `@/db/types`
   entrypoint).
6. **Keep validation co-located with routes** (the doc's intent) — each
   `routes/x.ts` gets a sibling `routes/x.schema.ts` re-exporting from
   `src/schemas/`. This satisfies "one feature per file" and keeps the
   contract next to the handler.

## Suggested steps

- Edit `docs/spec/implementation.md` + `docs/spec/api-routes.md`: correct the
  validation stack description.
- `bun add zod @asteasolutions/zod-to-openapi`
- Create `src/schemas/{shared,chats,messages,actors,...}.ts`; migrate the
  `t.*` defs from `src/validation/schemas.ts` to Zod equivalents.
- Create `src/openapi/registry.ts` + `src/openapi/generate.ts`; add
  `routes/openapi.ts` serving `/openapi.json` and a Swagger UI HTML.
- Add `src/db/types.ts` re-exporting the public `DB` table interfaces.
- Wire `/api/docs` behind `config.swagger.enabled`.
