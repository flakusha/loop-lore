<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Gif picker button dead in real chat view — _gifOpen never flips

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: Clicking the gif picker button in the real chat view never opens the picker panel: chatState._gifOpen stays false and no [data-testid='gif-picker-panel'] renders.

ROOT CAUSE (suspected): The gifPicker actions ARE merged into chatState (bootstrap.ts:96) and unit tests pass, so the runtime wiring differs — suspected an outside-click closer swallowing the opening click. Button lives at input-area.html:356.

EVIDENCE: Failing-run tail:
TimeoutError: waiting for locator('[data-testid=gif-picker-panel]') to be visible
(fail) Composer interactions (B7) > gif picker button opens the picker panel

FIX DIRECTION: Trace the runtime click path (outside-click closer vs handler order) and fix so the opening click flips _gifOpen and renders the panel.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue c926e5a (registry tip: 3adda8031 Konstantin Fedotov Close issue)
