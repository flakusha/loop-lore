<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: coverage.mjs counts top-level src files as modules

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

scripts/check/coverage.mjs derives the module name as the first path segment after stripping src/, so a top-level file like src/elysia-app.ts is reported as module 'elysia-app.ts' in the per-module coverage table. Cosmetic/reporting-only (affects rows and the --only matching surface), no functional impact on gating correctness for directory modules. Fix direction: skip or specially-group SF records whose extracted module segment still contains a dot.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
