<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: finalize phase-2 unit suite flakes on hard 5000ms budgets under parallel load

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

8 finalize attempts on 2026-11-01 (branches p0-nsfw-body-state / p0-a11y-responsive), run ids .tmp/giwt/runs/{20261101T104905-4023199,20261101T110630-4083722,20261101T113623-34710,20261101T121522-426960,20261101T122535-518126,20261101T124303-774303,20261101T125753-916796,20261101T131404-1055161}-finalize.

Pattern: rotating single victims per run — admin/news.test.ts (weight-change, 2x), mesh_outbox (post-insert), import-ssrf (public-host), browser files (new-chat-advanced-fields, chat-settings-save, encryption-flow). Every victim passes in isolation. A standalone full test:unit run on identical content failed 2 DIFFERENT tests. Zero diff intersection between the branches (frontend a11y vs plan docs).

Proposed directions: raise/relax the hard 5000ms test timeout budget, or serialize the unit suite (or its timing-sensitive subset) in finalize phase-2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
