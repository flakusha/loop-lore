<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: RSI ops doc and typed capability constants

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-harness-rsi-repo-access
**Tags:** rsi, docs
**Depends on:** `TASK-rsi-isolation-test-matrix`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Hand-written ops doc covering principal tiers, capability grants, and the escalation flow (amendment A11: policy/runbook surface — hand-written is appropriate for a small closed surface; no doc pipeline needed). The capability vocabulary itself must live as a typed constants module consumed by validation and enforcement (landed with the capability-grant ticket) so doc tables can be checked against the constant instead of drifting.
AC: doc tables enumerate exactly the typed constant's members; no code changes beyond the constants module.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Doc tables enumerate exactly the typed constant's members (cannot drift)
- [ ] No code changes beyond the constants module (hand-written policy/runbook surface)
