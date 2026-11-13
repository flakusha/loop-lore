<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Escalation audit queue with no auto-approve

**Status:** Done
**Status Note:** escalation queue landed on branch `harness-principal-kind` — `src/integrations/harness/repo-access/escalation.ts` (the request path: recorded, default-deny, rate-limited; an approved key grants ONE root change and the approval is consumed by the request that redeems it) + `escalation-queue.ts` (the admin queue: list pending, append an approve/deny decision) + `src/routes/harness/escalations.ts` (the admin-gated API). The rows live in the EXISTING `tool_call_audit` table under their own tool name — no new table, no migration.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-rsi-repo-access
**Tags:** rsi, escalation, audit
**Depends on:** `TASK-capability-grant-model-on-chat-branches`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Replace the requestRootChange silent log with an audited request row plus admin approval queue. Default deny; NO auto-approve (amendment A2 — the draft's 'auto-approve only when principal is lolo' is deleted; the internal-service principal holds its capabilities as grants and has no escalation flow at all). Audit rows land in the EXISTING tool_call_audit table (migration 092, already carries verdict/required_role/escalation_attempt) rather than a new agent_actions table (amendment A7; provisional — owner may override).
Context correction (amendment A8): requestRootChange is plumbed but set by no production caller today — default-deny is the only live behavior.
AC: escalation requests are recorded, approvable, rate-limited; deny-by-default preserved.

**Context:**

The recorded denial was the only live behavior: `requestRepoRootChange` wrote an
audit row and refused, with no way for an admin to ever say yes. This slice adds
the missing half — the admin decision — WITHOUT the auto-approve the draft asked
for (amendment A2): a request stays denied until an admin approves it, and the
approval is consumed by the request that redeems it (one root change, not a
standing grant).

Constraints: no new table (amendment A7) and no migration — the queue IS the
existing `tool_call_audit` trail, read back per key (subject principal, principal
kind, target path). Every row for a key is appended, so the LAST row decides
the key: a request is pending, an approval grants, a redeemed approval closes.
A decision row references the request id, so the recorded request is never
rewritten.

Alternatives considered: an in-memory queue (mirroring the ACP permission
queue) was rejected — the decisions would not survive a restart and the audit
trail would be the only record; a new `escalation_requests` table was rejected
(amendment A7 + no migration).

Not built here (follow-up): the Alpine admin tab for the queue — the admin API
is the approvable surface; and the capability-grant PERSISTENCE slice
(`TASK-capability-grant-model-on-chat-branches`), which needs a migration.

**Acceptance Criteria:**

- [x] Escalation requests are recorded, approvable, rate-limited; deny-by-default preserved
- [x] NO auto-approve for any principal; audit rows land in the EXISTING tool_call_audit table (no new agent_actions table)
