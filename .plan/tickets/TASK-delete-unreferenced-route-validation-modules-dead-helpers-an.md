<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Delete unreferenced route/validation modules, dead helpers and character error classes

**Status:** Not Started
**Priority:** medium
**Effort:** Small

**Summary:**

Remove the dead A/B comparison store, the unused RPG handler wrapper, the unwired deprecation-header pair and several unused helpers, plus 7 unreferenced error classes in src/characters/errors.ts. Research: .tmp/simplification/routes.md and .tmp/simplification/characters-assets.md.

**Context:**

Whole modules and whole error classes that nothing constructs, plus a handful of helpers whose only
caller is their own test. Source: `.tmp/simplification/routes.md` (findings 1-11) and
`.tmp/simplification/characters-assets.md` (finding 2). Re-derive with `bun run dead:code:src`.

**Scope — whole modules to delete:**

- `src/routes/generation/comparison-store.ts:1-89` — the in-process A/B store. Its own symbols
  (`saveRun`, `getRun`, `listRuns`, `setRating`, `clearRuns`) appear only inside the file. The DB
  table `model_comparison_runs` (`src/db/schema-core.ts:1361`) is the real persistence and is NOT
  touched by this file — leave the schema and its consumers alone.
- `src/routes/rpg/handler.ts:1-102` — the RPG route-handler wrapper (`rpgHandler`, `rpgRouteConfig`,
  `RpgRouteContext`). `src/routes/rpg/index.ts` mounts 16 route plugins and imports none of them;
  RPG routes already use `requireUserId` + `jsonError` directly.

**Scope — dead helpers inside live files:**

- `src/routes/middleware/deprecation-headers.ts:13-21,44-105` — `applyDeprecationHeaders` +
  `withDeprecationHeaders` + the `DeprecationHeadersOptions` interface that only parameterizes them.
  The only wired path is `deprecationAfterHandle`, which writes `ctx.set.headers` in place.
- `src/validation/middleware.ts:150-153` — the deprecated `validationErrorHandler` alias; the barrel
  `src/validation/index.ts:17` exports `onValidationError` directly.
- `src/routes/admin/aux-telemetry.ts:95` — `resetTelemetryPiiSecretCache`, a test-only reset hook with
  no caller (unlike the neighbouring `resetRegisterRateLimiter` / `resetLoginRateLimiter`, which do
  have e2e callers).
- `src/routes/http-utils/status.ts:84-93` — `translateError`, a one-line wrapper over an
  optional-callable. The `TranslatorFn` import at `status.ts:4` becomes unused too.

**Scope — unreferenced error classes in `src/characters/errors.ts`:**

Only `CharacterValidationError` and `AssetImportError` are constructed in production. Delete
`FormatDetectionError`, `CharxExtractionError`, `PngExtractionError`, `ExportError`,
`UnsupportedExportFormatError`, `ExportDataNotFoundError`, `ZipGenerationError`
(`errors.ts:33-47,68-79,80-91,110-127,128-144,145-161,162-176,182-196`) and drop the now-dead
`|| error instanceof ExportError` arm from `handleImportExportError`. Delete
`src/characters/errors-branches.test.ts:1-169` with them.

**Evidence:**

- Reachability sweep (entry points = package.json script targets + every `*.test.ts`, transitive via
  `from "…"` resolution including `.js`-suffixed specifiers) → `UNREACH
  src/routes/generation/comparison-store.ts`, `UNREACH src/routes/rpg/handler.ts`;
  `grep -rnI "comparison-store" src/ scripts/ tests/ --include='*.ts'` → no hits outside the file.
- `grep -rnIFw "rpgHandler" src/ tests/` → only `handler.ts:30,38` (a JSDoc `@example` and the
  definition); same for `rpgRouteConfig` at `handler.ts:34,64`.
- `grep -rnIFw "applyDeprecationHeaders" src/ scripts/ tests/ --include='*.ts'` → only
  `deprecation-headers.ts` (docblock + definition) and `deprecation-headers.test.ts`; same for
  `withDeprecationHeaders` and `DeprecationHeadersOptions`.
- `grep -rnIFw "validationErrorHandler" src/ scripts/ tests/ --include='*.ts'` → only the definition
  at `middleware.ts:153`.
- `grep -rnIFw "resetTelemetryPiiSecretCache" src/ tests/ --include='*.ts'` → only
  `aux-telemetry.ts:95`.
- `grep -rnIFw "translateError" src/ scripts/ tests/` → only `status.ts:91` and a stale
  `scripts/check/test-gaps-baseline.json:1124` entry.
- For the error classes: `grep -rn --include='*.ts' '<ClassName>' src/ tests/ | grep -v '^src/characters/errors'`
  → for all seven, the only remaining hits are inside `src/characters/errors-branches.test.ts`. The
  only production importers of the file are `src/routes/import/actor.ts:6` (imports exactly
  `AssetImportError`, `CharacterValidationError`) and `src/routes/import/handle.ts:6` (imports
  `handleImportExportError`). `src/characters/index.ts:8-17` does not re-export `./errors`, so no
  barrel keeps the classes alive.

**Caveats / constraints:**

- The deprecation-header pair is kept-out-of-reach *because it is the wrong mechanism*: a
  plain-object Elysia handler has no `Response` at `onAfterHandle` time, so the `new Response(...)`
  wrapper these two use would silently drop headers. Deleting them removes an inviting footgun —
  keep `deprecationAfterHandle` (the live in-place `ctx.set.headers` path) exactly as is.
- Removing `translateError` also strands its `scripts/check/test-gaps-baseline.json:1124` entry;
  drop that entry in the same change so the gap gate does not report a phantom.
- Do not change error *mapping* semantics in `handleImportExportError` beyond removing the dead
  `ExportError` arm — the surviving branches must keep their status codes.
- This ticket touches trust-boundary-adjacent import/export error handling: no sanitization,
  validation or status-code change is in scope.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
