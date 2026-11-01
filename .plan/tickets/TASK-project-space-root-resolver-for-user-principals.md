<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Project-space root resolver for user principals

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-rsi-repo-access
**Tags:** rsi, project-spaces
**Depends on:** `TASK-rsi-scope-resolver-per-principal-kind`, `epic-project-spaces-pm-integration` (BLOCKED-BY)
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Real helper mapping project space id -> filesystem root for user principals, replacing the pass-through in the scope resolver. Default-deny when space not found or no access.
BLOCKED until epic-project-spaces-pm-integration lands (amendment A3/A5 — that epic is Not Started with zero code and the draft's path scheme was unsourced, evaluation A14). Ship the pass-through resolver first; this ticket completes user-kind resolution.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Real space-id -> filesystem-root helper; default-deny when space not found or no access
- [ ] Remains BLOCKED until epic-project-spaces-pm-integration lands; pass-through resolver ships first
