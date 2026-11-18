<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Quiet-hours priority render scheduling

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-video-generation
**Tags:** video, deferred
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Evaluate quiet-hours, priority and pause-with-saved-cache scheduling for generation jobs on limited or quota-bound machines.

**Context:**
Deferred from the 2026-11-19 MiniMax H3 video workflow research (research doc §11.8). Operator target is offline batch generation with completion notifications; on limited hardware or quota-limited federated loop-lore/mesh-llm swarms a render should be able to yield to higher-priority work and resume from its saved cache. Existing quiet-hours code covers proactive chat messages, not render dispatch; `TASK-per-local-box-serial-video-dispatch-gate` covers serialization only. Federated priority negotiation makes testing costly, so this stays low priority until the base offline batch path lands.

**Acceptance Criteria:**

- [ ] Trigger: offline batch path landed plus a documented quota/contention scenario.
- [ ] Scheduling contract states what is persisted on pause (fragment manifest, part latents, job cursor) and who owns the resume decision.
- [ ] Coordination with existing proactive quiet-hours and serial dispatch rules recorded; no new global scheduler without that.

**Related:**

- `.tmp/research/minimax-h3-video-workflow-2026-11-18.md` §2.1, §11.7-8
- `TASK-per-local-box-serial-video-dispatch-gate.md`
- `TASK-quiet-hours.md`
- `epic-video-generation.md`
