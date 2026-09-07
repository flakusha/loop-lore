<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: coverage waivers for 3 modules below 80 floor

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

After unit-test-coverage-2, canonical gate (bun test --coverage --isolate src/ + scripts/check/coverage.mjs --floor=80) passes 43/46 modules; overall src line coverage 83.9%. Three modules cannot reach 80 with unit tests: (1) src/test-utils 30.7% — denominator is generated src/test-utils/insert-helpers.ts (1801 lines, DO NOT EDIT, regen via db:sync-types); (2) tests/ 58.6% — tests/setup-globals.ts runs as bun preload before coverage tracking starts (scoped file-alone run shows 100%, full-run lcov frozen at 17/29); (3) src/frontend 63.6% — remainder is DOM-bound (ui.ts, battle panel/render, asset-preview, focus-trap, htmx listeners, chat-sections/editing, notification widgets) plus admin/chat store tails needing browser env. Decide: per-module waiver list in coverage.mjs, DOM test harness, or accept. Related: modelSuitability BUG, pre-existing-failures BUG filed separately.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
