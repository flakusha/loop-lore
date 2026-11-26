<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Dedicated media scorer pack evaluation

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-multimodal-asset-reuse
**Tags:** scoring, deferred
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Evaluate a dedicated image/video aesthetic scorer pack only after QwenVL-as-judge proves too noisy or slow.

**Context:**
Deferred from the 2026-11-19 MiniMax H3 video workflow research (research doc §8.2, §11.9). The soft fork already carries QwenVL captioning, so a zero-new-node judge workflow is the cheap first answer. Dedicated scorer packs add weights, licenses and benchmark cost; no scorer node currently exists in the checkout. Revisit when judged samples show a measured quality-filter gap.

**Acceptance Criteria:**

- [ ] QwenVL-as-judge baseline recorded on a fixed sample set (score distribution + false-accept examples).
- [ ] Revisit trigger names the measured gap and the candidate packs with license/VRAM fences.
- [ ] No dedicated scorer pack vendored before the baseline comparison.

**Related:**

- `.tmp/research/comfyui-workflows/grading-gap.md`
- `epic-multimodal-asset-reuse.md`
- `TASK-DATASET-EXPORT-LAYER-SFT-DPO-IMAGE-AUDIO.md`
