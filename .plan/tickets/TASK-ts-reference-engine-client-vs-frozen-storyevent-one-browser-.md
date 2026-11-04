<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TS reference engine client vs frozen StoryEvent + one browser scene

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Ponytail path from game-engine review: single TS reference client against the frozen StoryEvent contract (blocked on StoryEvent-freeze ticket) + one browser scene (three.js OR babylon.js — pick one; NullEngine gives headless tests). Defer Unity/Unreal/O3DE until a consumer asks. Defold bob.jar headless+wasm-web is the second-engine candidate if a real engine is needed. Source: .tmp/research/game-engine-integration-review.md ranking.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
