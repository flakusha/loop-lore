<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Principal kind model and server-side resolution

**Status:** Done
**Status Note:** 2026-11-25 reconcile: the closed principal-kind vocabulary and its server-side resolution shipped — `PRINCIPAL_KINDS` (`src/middleware/principal-kind.ts:29`), fail-closed narrow `toPrincipalKind` (`:63-64`), and the actors-row mapping (`principalKindForActor`, same module). A caller-supplied kind can never assert a principal.
**Priority:** high
**Effort:** Medium
**Epic:** epic-principal-scoped-credentials
**Tags:** security, auth
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add typed PrincipalKind = user | user-worktree | internal-service | external-agent (renamed from draft 'lolo' — the shipped CLI binary is a client identity, not the server principal) with server-side resolution at ONE assertion point in the auth middleware: the principal resolves from a verified credential, never from caller-supplied input. internal-service binds to an actors row with actor_type 'system' so audit rows FK cleanly; PrincipalKind composes with userRole (RBAC vocabulary unchanged).
AC: tool params / chat context / request bodies can never assert a principal kind — a param-supplied principal is ignored; actors-row mapping covered by unit tests.
Extracted from repo-access draft task #1 per RSI-RepoAccess-EVALUATION §B2.1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Tool params / chat context / request bodies can never assert a principal kind — a param-supplied principal is ignored
- [ ] actors-row mapping (actor_type system for internal-service) covered by unit tests; composes with userRole
