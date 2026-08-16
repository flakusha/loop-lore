<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Code Practices & Improvement Research

Research folder for hardening loop-lore's coding standards and extensibility
post-MVP. Each topic file is grounded in the **actual current code** (file:line
references) plus a concrete improvement plan.

> **Cross-cutting finding (read first):** The implementation docs
> (`docs/spec/implementation.md`, `docs/spec/api-routes.md`) describe a **Zod**
> validation layer in `src/schemas/` with per-route companion `.schema.ts`
> files. The real code uses **Elysia's `t` (TypeBox)** in a single file
> `src/validation/schemas.ts`, and `src/schemas/` does not exist. The Zod +
> OpenAPI migration lives only as a _plan_ in
> `docs/meta/integration-testing-tools.md`. Treat the docs as aspirational until
> reconciled — see `06-schemas-and-openapi.md`.

## Topic index

| # | File                                    | Area      | Headline gap                                                                                                                   |
| - | --------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1 | `01-strict-typing.md`                   | Types     | Backend `tsconfig` strong; frontend `tsconfig` weak; `exactOptionalPropertyTypes` missing; `any` casts in DB wrapper           |
| 2 | `02-eslint-and-static-analysis.md`      | Lint      | No `sonarjs/cognitive-complexity` cap (functions hit ~96); no `eslint-plugin-import` (cycles); no `no-misused-promises`        |
| 3 | `03-extensibility-code-patterns.md`     | Patterns  | Dual dispatch (Elysia + `handleApiRequest` catch-all); high-complexity handlers; no event/tool bus                             |
| 4 | `04-code-organization-and-splitting.md` | Structure | `messages.ts` 702L, `generate-route.ts` 636L, `config/schema.ts` 692L, `server.ts` 546L; god-modules (`utils.ts` 52 importers) |
| 5 | `05-testing-e2e-multiple-db.md`         | Tests     | E2E safeguard good; only SQLite tested; no PG matrix; no contract tests; no coverage threshold in `check`                      |
| 6 | `06-schemas-and-openapi.md`             | Schemas   | TypeBox today, no OpenAPI export; Zod plan exists but unstarted; DB schema not exported for SDKs                               |
| 7 | `07-alternative-frontend-support.md`    | Frontends | REST API is the boundary (good); but view-serving + catch-all coupled; no content negotiation / CORS / `frontend.mode`         |
| 8 | `08-plugins-hooks-integration.md`       | Plugins   | Manifest model strong; **event bus, tool executor, UI mount, config merge all unwired**                                        |

## Prioritized roadmap

Ordered by leverage-to-effort. Each item references the topic file with the
exact change.

**P0 — correctness / unblock extensibility**

1. Wire a server-side **event bus** + **tool executor** so declared plugin
   extension points actually fire. (`08`)
2. Register plugin API routes _into_ Elysia at startup (kill `dispatchPluginRoute`
   linear scan + catch-all ordering). (`08`, `03`)
3. Add `sonarjs/cognitive-complexity` cap + split the 4-5 handlers over the
   limit. (`02`, `04`)
4. Reconcile docs vs code on validation (Zod vs TypeBox) before building more
   on top of the wrong assumption. (`06`)

**P1 — hardening & DX** 5. Tighten `tsconfig.frontend.json` to match backend strictness. (`01`) 6. Add `eslint-plugin-import` (no-cycle, order) + `no-misused-promises`. (`02`) 7. Parameterize `createTestDb(dialect)` and add a Postgres test path. (`05`) 8. Add `frontend.mode` config + Accept-based content negotiation for SPA/native. (`07`)

**P2 — polish & scale** 9. Migrate validation to Zod + `@asteasolutions/zod-to-openapi`; serve
`/openapi.json` + Swagger UI. (`06`) 10. Split oversized modules; break god-modules. (`04`) 11. Add API contract tests driven by the OpenAPI spec. (`05`, `06`)

## How to use these docs

Each topic file follows: **Current state** (what exists, with file refs) →
**Gaps** (what's missing/broken) → **Recommendations** (concrete, ordered)
→ **Suggested steps** (file-level actions). Recommendations favor
incremental, non-rewrite changes consistent with the project's "lightweight,
maintainable" goal and the AGENTS.md conventions (interfaces > types, <200L
files, one feature per file, Kysely types over raw DB modules).
