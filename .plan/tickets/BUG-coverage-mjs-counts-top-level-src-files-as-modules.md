<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: coverage.mjs counts top-level src files as modules

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved — closed 2026-09-14
**Priority:** Medium
**Effort:** Medium

## Summary

scripts/check/coverage.mjs derives the module name as the first path segment after stripping src/, so a top-level file like src/elysia-app.ts is reported as module 'elysia-app.ts' in the per-module coverage table. Cosmetic/reporting-only (affects rows and the --only matching surface), no functional impact on gating correctness for directory modules. Fix direction: skip or specially-group SF records whose extracted module segment still contains a dot.

## Resolution

Resolved by commit `b63efbede` on 2026-09-10. `scripts/check/coverage.mjs:194` (`const mod = seg.includes(".",) ? "(root)" : seg;`) renames the bucket for top-level files to `(root)` instead of emitting `elysia-app.ts` as a module row. The `(root)` bucket is waived in `WAIVERS["(root)"]` at `coverage.mjs:107-110` (floor 75), so the runtime coverage gate stays green even when the composition root has low coverage.

Regression coverage in `scripts/check/coverage.test.ts:33-51`:
- Synthetic lcov with `SF:src/elysia-app.ts` + `SF:src/server/handler.ts` exits 0.
- Asserts both modules appear in the row list (`server` + `(root)`); the test name + assertion were updated to match the rename-to-bucket semantics (not skip) when the bookkeeping commit landed.
- `bun run check:parallel --gates "typecheck - backend,lint - oxlint (correctness),format - dprint,db - schema gate,coverage - per-module line %,plan - ticket index (sync)"` 6/6 pass on `dev @ cc55b4aa0`.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
