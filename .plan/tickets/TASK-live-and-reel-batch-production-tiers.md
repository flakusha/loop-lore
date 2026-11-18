<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Live and reel batch production tiers

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-video-generation
**Tags:** video, deferred
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Evaluate live-stream output, marketing/reels batch production and a multi-user render farm as future delivery tiers.

**Context:**
Deferred from the 2026-11-19 MiniMax H3 video workflow research (research doc §8.2, §11.9). Those scenarios need continuous capture, brand workflows or shared scheduler/quota infrastructure; testing is costly and the product need is unproven. loop-lore's current target is offline, project-bound fragment generation with per-scene approval (§11.7). Existing `TASK-per-local-box-serial-video-dispatch-gate` covers single-box serialization — this ticket is only for revisiting the wider tiers.

**Acceptance Criteria:**

- [ ] One concrete usage scenario per tier (live / reels / farm) with an operator sponsor before design work.
- [ ] Resource model (concurrency, quota, isolation) and test strategy documented; no farm code before that.
- [ ] Conflict with the serial local-box dispatch gate explicitly resolved in the plan.

**Related:**

- `.tmp/research/minimax-h3-video-workflow-2026-11-18.md` §8.2, §11.7
- `TASK-per-local-box-serial-video-dispatch-gate.md`
- `epic-video-generation.md`
