<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: avatar-state-sse-envelope

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-realtime-transports
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Backend emits per-turn avatar-state {emotion, speech{ttsUrl,visemeTimeline}, gesture, camera} over existing SSE; frontend Alpine subscriber updates renderer; envelope documented in state-contracts section. Owner epic: epic-realtime-transports. Anchors: src/frontend/vn/sprite-stage.ts:176; src/assets/service/delete.ts:84-85; NEW FILE NOTE: research section 30 cites src/prompt/types.ts which does NOT exist — treat as new-file surface. Refs: https://github.com/myths-labs/prometheus-avatar (SSE state shape template); https://github.com/met4citizen/TalkingHead (viseme pipeline). Acceptance: envelope emitted per turn; Alpine subscriber updates renderer; documented in state contracts. Source: internet-expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
