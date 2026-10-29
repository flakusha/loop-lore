<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: avatar-emotion-map-config

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-character-core-system
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Per-character liveAvatarConfig JSON (rigType, emotion-to-expression/gesture/camera map) validated, stored, served via GET; missing model falls back to static portrait. Owner epic: epic-character-core-system. Anchors: src/assistant/intent.ts:21 (detectAvatarChangeIntent keyword fallback); src/prompt/sections/emotion-avatar.ts:14 (emotionAvatarSection); src/avatar/ does not exist (new surface). Refs: https://github.com/myths-labs/prometheus-avatar (emotion-map template); https://github.com/guansss/pixi-live2d-display (VN 2D default; Cubism SDK license gate). Acceptance: schema validated server-side; GET serves config; missing model falls back to static portrait. Source: internet-expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
