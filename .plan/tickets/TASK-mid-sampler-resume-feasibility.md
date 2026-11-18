<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Mid-sampler resume feasibility

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-video-generation
**Tags:** video, deferred
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Evaluate true mid-sampler checkpoint/resume for H3 fragments; today resume is artifact-based and post-sampling only.

**Context:**
Deferred from the 2026-11-19 MiniMax H3 video workflow research (research doc §3, §9, §11.1). The local Director NG caches finished part latents and re-queues a plan; DaSiWa stages continuity checkpoints; both lose the in-flight sample on a crash. Core ComfyUI has no resume path. Mid-sampler checkpointing means touching sampling internals or forking a node pack — high cost and update risk. Revisit only if ComfyUI adds a supported checkpoint hook or fragment cost justifies a maintained fork.

**Acceptance Criteria:**

- [ ] Trigger recorded: upstream checkpoint hook available, or measured rerender cost above the agreed threshold.
- [ ] Research note distinguishes sampler-state resume from the existing part-latent re-queue.
- [ ] Update/sync impact on the soft fork documented before any implementation.

**Related:**

- `.tmp/research/minimax-h3-video-workflow-2026-11-18.md` §2.1, §3, §9
- `ng/adapters/resume.py` (local Director NG)
- `epic-video-generation.md`
