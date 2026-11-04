<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Engine demo scene plus offline-fallback story

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Engine NPC backend has StoryEvent type + scoped WS feed; missing table stakes: persona/world/memory demo scene (godot_llama pattern) + offline-fallback pitch (Kinloom pattern). Scope: runnable Godot demo consuming the feed + documented no-model fallback. Research: metaapp-usages mode 5.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
