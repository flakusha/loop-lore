<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Async spill and TUI logs are cwd-relative so local instances collide

**Status:** Done
**Scope:** Scope spill and TUI log roots to resolveInstanceDir() so concurrent local instances cannot delete each other's spill bodies
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Two servers on one checkout share .tmp/async-store and .tmp/tui/tui.jsonl. Instance A's orphan-spill sweep deletes B's spill files while B's request row still points at them; status returns body: null. Resolve both roots under resolveInstanceDir() and add a two-instance regression.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-11-20 registry-driven close: git issue f8ccaea (registry tip: 2ce0f1003 Konstantin Fedotov Close issue)
