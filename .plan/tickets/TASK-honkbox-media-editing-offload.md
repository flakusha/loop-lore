<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Honkbox media editing offload

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-external-creative-tool-bridge
**Tags:** honkbox, deferred
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Evaluate honkbox as the optional media-editing offload (frames/parameter extraction, codec, compression, hardware accel) instead of direct ffmpeg calls in loop-lore.

**Context:**
Deferred from the 2026-11-19 MiniMax H3 video workflow research (research doc §8.2, §11.8). Direct ffmpeg from loop-lore is possible but poorly managed; honkbox can provide richer video/image/audio editing and data extraction when available on the target machine. `TASK-bridge-mlt-melt-render-tier` and `TASK-bridge-auto-editor-handoff` already cover probe-gated host subprocess tiers — this ticket covers the honkbox capability path only. Testing depends on a provisioned honkbox instance and hardware, so it stays low priority.

**Acceptance Criteria:**

- [ ] Capability contract names the media operations and extraction outputs loop-lore would consume (frames, parameters, codec/quality reports).
- [ ] Fallback when honkbox is absent explicitly documented; no hard dependency.
- [ ] Existing melt/auto-editor tiers checked for overlap before any new wiring.

**Related:**

- `.tmp/research/minimax-h3-video-workflow-2026-11-18.md` §6, §11.8
- `TASK-bridge-mlt-melt-render-tier.md`, `TASK-bridge-auto-editor-handoff.md`
- honkbox `.plan/epics/epic-media-timeline.md`
