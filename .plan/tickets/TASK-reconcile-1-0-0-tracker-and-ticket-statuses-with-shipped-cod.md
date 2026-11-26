<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: reconcile 1.0.0 tracker and ticket statuses with shipped code

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-docs-reconciliation.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The 1.0.0 tracker and several epics/tickets still describe shipped work as pending or pending work as shipped. Reconciliation is documentation-only and unblocks a truthful release scope.

**Evidence (dev 2026-11-18):** report 07 lists six contradictions; reports 12, 13, 14 and 15 add bookkeeping drift; two tickets contain duplicated Summary fields from an older giwt version.

**Scope:** close multi-assistant GAP, expose-validation-harness, autoroute ticket premise while keeping its admin-menu leg, MFA docs claim, and correct fractal, llama-swap, backup, theme-4, TUI and theme-5 headers; remove the two duplicated Summary sections.

**Acceptance Criteria:**

- [ ] tracker Required rows match code evidence
- [ ] no stale Not Started ticket for shipped work
- [ ] plan validate format gates pass
- [ ] no source changes

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
