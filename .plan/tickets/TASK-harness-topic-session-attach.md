<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness work-topic session attachment

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `.plan/epics/epic-harness-integration.md`
**Tags:** harness, data-model, lineage
**Summary:** Append-only `harness_work_topic_sessions` join recording session↔work-topic attachment lineage, plus a `work_topic_id` field on the §8 exec-log record.
**Context:** Three session concepts already exist and are reused, not re-created: in-memory `WorkflowSession` keyed by `chatId` with no TTL (`src/assistant/workflow-session.ts:23`), the `workflow_sessions` table with 24h `WORKFLOW_SESSION_TTL_MS` (`src/assistant/workflow-session-store.ts:19`), and `request_results` with a 24h window (`src/async/store.ts:27-46`). A harness run session is a NEW concept layered above all three and keyed by run id — say so in the epic, do not blur it with the auth `sessions` table (`src/db/schema-manifest.ts:2441`). Attachment is a first-class record (matching the §8 "one record per run, append-only" posture), not a mutable pointer.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] `harness_work_topic_sessions` joins as `(sessionId, workTopicId, attachedAt, detachedAt, attachedBy)`. Detach writes a row/stamps the detach — it is never a `DELETE` — so attachment lineage survives detachment and reattachment.
- [ ] The harness run session concept is documented as distinct from `WorkflowSession` (`src/assistant/workflow-session.ts:23`), `workflow_sessions` (`src/assistant/workflow-session-store.ts:19`), `request_results` (`src/async/store.ts:27-46`), and the auth `sessions` table (`src/db/schema-manifest.ts:2441`); it is keyed by run id, not `chatId`.
- [ ] `work_topic_id` is added to the §8 `.harness/executions.jsonl` record schema so an exec-log entry correlates back to its topic; a null/absent field parses cleanly for runs recorded before this change.
- [ ] Detach is idempotent — a second detach on an already-detached record is a no-op with no duplicate row and no error.
- [ ] Shipped in the same migration batch as `TASK-harness-work-topics` (`harness_work_topics` + §11 `harness_runs`/`harness_calls`).
- [ ] Test asserts lineage reconstructs across a detach + reattach cycle (full ordered attachment history for one session).
- [ ] `bun run check` green.

## Related Files

- `src/harness/` (new — attach/detach, lineage query), `.harness/executions.jsonl` (§8 record schema)
- `src/assistant/workflow-session.ts:23`, `src/assistant/workflow-session-store.ts:19`, `src/async/store.ts:27-46`, `src/db/schema-manifest.ts:2441`
- `.plan/epics/epic-harness-integration.md` (§8 exec log, §11 storage)
- `TASK-harness-work-topics`, `TASK-harness-context-priority-tiers`

git issue: 668a941
