# 04 — Code Organization & Splitting

## Current state (good parts)

The DB layer is already well-split: `schema-core.ts`,
`schema-generation.ts`, `schema-story.ts`, `schema-content.ts`,
`schema-synthetic.ts`, `schema-telemetry.ts`, plus `enums-core/-config/-
content/-generation/-story.ts`. Migrations live in `src/db/migrations/`
numbered sequentially with a `parts/` subdir. Kysely types are the single
source for DB rows; services depend on the `Kysely<DB>` instance, not raw
modules (per AGENTS.md).

## Gaps — oversized modules

| File                               | ~Lines                             | Problem                                                      |
| ---------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `src/routes/messages.ts`           | 702                                | CRUD + streaming + attachments + archiving in one file       |
| `src/generation/generate-route.ts` | 636                                | Orchestration + provider calls + persistence                 |
| `src/config/schema.ts`             | 692                                | Entire config shape in one interface file                    |
| `src/server.ts`                    | 546                                | Bootstrap + HTTP serving + static + docs + TLS + plugin load |
| `src/elysia-app.ts`                | ~160 (logic) + 30 manual `app.use` | Manual route registry                                        |
| `src/plugins/loader.ts`            | 194                                | Load + onLoad dispatch + shutdown in one fn (complexity 48)  |

## Gaps — god modules

- `src/utils.ts` — imported by **~52 files**. Safe-JSON / date / id helpers
  all in one place; any change ripples widely. AGENTS.md explicitly warns
  against god modules.
- `src/logger/index.ts` — imported by **~59 files**. Acceptable for a
  logger, but the index re-exports many sub-services, masking what callers
  actually need.

## Gaps — structural

- **No route registry** (see `03`): 30+ `app.use(...Routes(handleOpts))`
  lines in `elysia-app.ts` are hand-maintained.
- **`<200L` convention** (AGENTS.md) is violated by the 4 files above with
  no mechanical enforcement. `jscpd` checks _duplication_ but not _size_.

## Recommendations

1. **Split `routes/messages.ts`** into `messages/`:
   `crud.ts`, `stream.ts`, `attachments.ts`, `archiving.ts`, `index.ts`
   (barrel exporting the Elysia module). Each stays <200L.
2. **Split `generation/generate-route.ts`** into `src/generation/steps/`
   (buildPrompt → callProvider → streamToClient → persist → postProcess),
   orchestrated by a thin route handler. Mirrors the existing generation
   pipeline design.
3. **Split `config/schema.ts`** by domain (`auth.ts`, `db.ts`, `assets.ts`,
   `generation.ts`, …) under `src/config/schema/`, re-exported from
   `schema.ts`. Keep the merged `Config` type as the public surface.
4. **Split `server.ts`** into `server-bootstrap.ts` (wire deps, plugins,
   providers), `server-http.ts` (Bun.serve + static + docs), `server-tls.ts`.
5. **Extract a route registry** (`src/routes/registry.ts`) and iterate it in
   `elysia-app.ts` (see `03`).
6. **Break `utils.ts`** into `utils/json.ts`, `utils/date.ts`, `utils/id.ts`,
   `utils/http.ts`; update imports via the IDE/ESLint `import/order` assist.
   Keep `utils.ts` only as a thin re-export if needed for back-compat.
7. **Enforce size mechanically**: add a size guard to CI (`tsc` can't, but a
   tiny `scripts/check-file-size.ts` or a `markdownlint`-style custom check,
   or simply rely on the new `sonarjs/cognitive-complexity` cap from `02` which
   indirectly caps file density).
   `scripts/check-file-size.ts` is the 250L soft guard (non-blocking; `--strict`
   for CI). It **excludes** `*.test.ts`, `/migrations/`, and auto-generated files
   (those carrying the `DO NOT EDIT MANUALLY` banner from the `db:sync-*`
   generators) — they are legitimately large or owned by their generator.

## Suggested steps

- `mkdir src/routes/messages src/generation/steps src/config/schema src/utils`
- Move functions, add `index.ts` barrels, update imports (run `bun run typecheck`
  after each move — Bun's path alias makes this low-risk).
- Add `src/routes/registry.ts`; refactor `elysia-app.ts` to iterate it.
- `scripts/check-file-size.ts` (warn >250L, excluding tests/migrations/generated) is the size guard; wire `--strict` into pre-commit/CI when the worst files are split.
