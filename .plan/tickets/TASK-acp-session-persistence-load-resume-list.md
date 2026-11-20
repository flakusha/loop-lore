<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP session persistence load resume list

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** Add ACP session persistence: `session/list` + `session/resume` first, then `session/load` with transcript replay.

**Context:** loop-lore stores `acp_session_id` (`src/integrations/harness/turn-persistence.ts:152-157`) but cannot re-attach; omp, opencode, codex-acp and claude-agent-acp all expose list/resume/load. Gap G6 in `.tmp/research/harness-parity/21-parity-gap-ranked.md:407-438`. The two slices differ in persistence model: resume has no replay, load must replay `session/update` history into the turn transcript.

**Acceptance Criteria:**

- [ ] A per-test session store indexes profile → { sessionId, cwd } and lists sessions.
- [ ] `session/resume` re-attaches without replay; `session/load` replays one `agent_message_chunk` into the transcript.
- [ ] Fixture and adapter children are per-test and reaped in `afterEach`, including failure paths.
