<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: story escalate action posts /story/escalate but route is /gm/escalate

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Location: src/frontend/alpine/story-controls.ts:55 vs src/routes/story-orchestration/index.ts:195.

The story-controls client builds every action URL as /api/v1/chats/:id/story/${action}, so the "escalate" action posts to /api/v1/chats/:id/story/escalate. The backend only mounts POST /api/v1/chats/:id/gm/escalate (story-orchestration/index.ts:195), so the GM panel's 'Escalate to Me' button (gm-story-panel.html gm-escalate, wired through storyState.escalateToMe -> storyControl(chatId, 'escalate')) can never succeed: the request 404s and the UI always shows the failure toast.

Found during TASK-story-turn-order design (DQ6.6, .tmp/2026-11-03/turn-order-design.md). Not fixed in that slice; fix is either a special-case escalate URL in storyControl() or a route alias for /story/escalate.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
