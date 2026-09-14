# BUG: coverage.mjs counts top-level src files as modules

**Status:** ✅ Resolved — closed 2026-09-14
**Priority:** Medium
**Effort:** Medium

## Summary

scripts/check/coverage.mjs derives the module name as the first path segment after stripping src/, so a top-level file like src/elysia-app.ts is reported as module 'elysia-app.ts' in the per-module coverage table. Cosmetic/reporting-only (affects rows and the --only matching surface), no functional impact on gating correctness for directory modules. Fix direction: skip or specially-group SF records whose extracted module segment still contains a dot.

## Resolution

Resolved on dev before 2026-09-14. `scripts/check/coverage.mjs:194` implements the suggested fix: `const mod = seg.includes(".",) ? "(root)" : seg;`. Top-level files like `src/elysia-app.ts` collapse into the `(root)` bucket instead of being reported as a module named `elysia-app.ts`.

Gate evidence: synthetic grouping test (`SF:src/elysia-app.ts` + `SF:src/server/foo.ts` + `SF:src/server/bar/baz.ts`) confirms `src/elysia-app.ts → (root)` and `src/server/*` keeps the directory as `server`. Full `bun run check:parallel --gates "…coverage - per-module line %"` 5/5 pass on `ticket-work @ 810143d02`.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
