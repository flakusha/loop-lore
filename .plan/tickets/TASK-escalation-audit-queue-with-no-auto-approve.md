<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Escalation audit queue with no auto-approve

**Status:** Not Started
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

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Escalation requests are recorded, approvable, rate-limited; deny-by-default preserved
- [ ] NO auto-approve for any principal; audit rows land in the EXISTING tool_call_audit table (no new agent_actions table)
