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

Delivered by the sibling harness-surfacing lane and landed on dev as
`64495e4ec` (feat(chat): surface harness/async job state as job_status
messages) + `0fd943272` (parallel-safety hardening) + `46315a235` (review
nits); verified 2026-11-11 in the harness-tail-gaps worktree against that
state. Delivered shape: `job_status` MessageContentType
(src/db/enums-core/messages.ts); append-only best-effort writer
`src/chat/service/job-status.ts` (dedupe memo keyed jobId+state+step =
single-transition write, terminal states clear memo entries); initial
`pending` row posted in `maybeAutoReply` after the pause gate
(src/routes/messages/reply.ts), keyed by x-request-id; AsyncStore
progress/completion bridged via `src/generation/auto-gen/job-status-bridge.ts`
(persisted row + live SSE `job-status` event, no polling); harness turnId
(attemptId) stamped into `messages.metadata` on complete/failed rows for
exec-log joins. Notification-to-new-turn stays gated: the bridge is
display-only and never schedules generation, so the reply-route pause gate
and group-cascade depth checks remain authoritative. Alternatives
(update-in-place status rows, frontend polling) rejected: append-only
journal rows keep the timeline replayable and match the swipe-sibling
immutability philosophy.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing (36 pass: job-status.test.ts, job-status-bridge.test.ts, reply.test.ts)
- [x] Documentation updated (CHANGELOG.md entry in `64495e4ec`)
