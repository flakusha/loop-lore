<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: project-owner-root-permissions

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-remote-harness-federation.md
**Tags:** harness, auth, ownership
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Ownership model: the project owner holds permission on the project root in addition to worktrees. A root-level grant is checked alongside the existing worktree scope guard so no privilege escape is possible via worktree attach, while normal worktree flows are unaffected.

Explicitly NOT building:

- A full RBAC matrix (owned by a separate access epic).
- Per-file ACLs.
- Changes to existing worktree guard semantics beyond adding the root check.

**Context:**

Root permission must compose with, not replace, the worktree scope guard from the inbound facade work, and with the per-user isolation gate from epic-external-harness-acp.md. Related: epic-harness-integration.md, epic-external-harness-acp.md.

**Acceptance Criteria:**

- [ ] Owner grant on the project root is required alongside worktree access.
- [ ] Worktree attach cannot escalate past the root grant.
- [ ] Non-owners see no behavior change on allowed paths.
- [ ] Tests passing, documentation updated.
