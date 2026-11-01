<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Internal-service bootstrap principal

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-harness-rsi-repo-access
**Tags:** rsi, principal, security
**Depends on:** `TASK-rsi-scope-resolver-per-principal-kind`, `TASK-capability-grant-model-on-chat-branches`, `TASK-scoped-credential-model-and-api-key-table`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Bootstrap the internal-service server-side principal (renamed from draft 'lolo' — amendment A6: 'lolo' is the shipped CLI binary name; the principal maps to an actors row with actor_type 'system' and composes with userRole, which remains the RBAC vocabulary) with repo-root scope and all capabilities as GRANTS — no escalation flow (amendment A2). Credentials issued through the shared credential seam (amendment A9: sibling of the authenticate derive + requireAuthGuard fail-closed pipeline; revocation = row deletion). Token issuance shape per RSI Open Q #1 (OPEN — owner decision, evaluation §5 Q4). No passphrase storage (GPG stays agent-side).
AC: the principal holds grants not escalation bypasses; repo-root writes go through worktree + finalize (provisional — owner may override); direct-to-dev reserved for watchdog self-heal hotfixes.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] The principal holds grants, not escalation bypasses
- [ ] Repo-root writes go through worktree + finalize (direct-to-dev reserved for watchdog self-heal hotfixes)
