<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Shrink unreferenced types and helpers in routes/validation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Remove three zero-importer type/interface declarations from the routes and validation layers. These `shrink:` findings from the routes slice of the over-engineering audit (scratch, not on disk) (findings 17, 21, 23) are not explicitly scoped in the existing routes cleanup ticket (`TASK-delete-unreferenced-route-validation-modules-dead-helpers-an.md`), which covers the modules they live in but not these specific within-file dead types.

**Context:**

These three `shrink:` findings from the routes slice of the over-engineering audit (scratch, not on disk; findings 17, 21, 23) are within files already covered by `TASK-delete-unreferenced-route-validation-modules-dead-helpers-an.md`, but that ticket's scope ends at the module/file level and does not explicitly name these within-file dead type declarations. All three are zero-importer symbols whose removal changes no behaviour.

**Scope:**

1. `src/routes/http-utils/types.ts:30-40` — `PaginatedResponse<T>` interface, 11 lines. `grep -rnIFw "PaginatedResponse" src/ tests/ --include='*.ts'` → only `types.ts:31` (definition); no barrel re-exports it. `PaginatedEnvelope` (middleware layer, 3 refs) is the live equivalent — do not touch it.
2. `src/middleware/types.ts:68` + `src/middleware/index.ts:22` — `RouteHandler` type alias, ~2 lines of surface. `grep -rnIFw "RouteHandler" src/ tests/ --include='*.ts'` → only the barrel re-export and the definition. `Middleware` (10 refs) and `RequestContext` (24 refs) in the same barrel are live.
3. `src/routes/middleware/deprecation-headers.ts:13-21` — `DeprecationHeadersOptions` interface, ~9 lines. `grep -rnIFw "DeprecationHeadersOptions" src/ tests/ --include='*.ts'` → only `deprecation-headers.ts:14,60`. The only parameterizing function (`applyDeprecationHeaders`) has zero production callers and is covered by `TASK-delete-unreferenced-route-validation-modules-dead-helpers-an.md`.

**Evidence:**

All three verified by whole-repo grep for the symbol name (word-boundary, case-sensitive) returning exactly the definition line and barrel re-export lines, zero production call/import sites.

- `grep -rnIFw "PaginatedResponse" src/ tests/ --include='*.ts'` → `types.ts:31` (def) only.
- `grep -rnIFw "RouteHandler" src/ tests/ --include='*.ts'` → `middleware/types.ts:68` (def) + `middleware/index.ts:22` (re-export) only.
- `grep -rnIFw "DeprecationHeadersOptions" src/ tests/ --include='*.ts'` → `deprecation-headers.ts:14` (def) + `deprecation-headers.ts:60` (use) only.

**Caveats / constraints:**

- No `scripts/check/test-gaps-baseline.json` entry references `PaginatedResponse` (verified by grep), so removing it strands no baseline entry.
- No behavior change — pure type/interface removals. `Middleware`, `RequestContext`, and `PaginatedEnvelope` in the same barrels are unaffected.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
