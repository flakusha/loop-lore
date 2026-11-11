<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness inflight job handles

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-harness-integration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Option B first slice: surface harness job state as chat messages. Scope: add a job_status MessageContentType (code-only enum + text column, src/db/enums-core/messages.ts:19-29) with a best-effort writer cloned from injectPartyNarration (src/chat/service/party-narration.ts:47-91); post the initial job row in maybeAutoReply (src/routes/messages/reply.ts:81-105) keyed by x-request-id; bridge AsyncStore progress/completion (src/async/store.ts:55-59, states exclusive at :28) to message updates; stamp harness turnId (src/generation/auto-gen/call-llm.ts:177) into messages.metadata for exec-log to chat joins. AC: single-transition status write; notification-to-new-turn gated through the existing pause/cascade gates (reply.ts:63-76 pause gate, group-cascade.ts:31-36 cascade depth; Claude Code issues #11716 and #81048 as design guards); no polling.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-11-11 registry-driven close: git issue 2b1e55d (registry tip: 7a00eb102 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-HARNESS-INFLIGHT-JOB-HANDLE)
