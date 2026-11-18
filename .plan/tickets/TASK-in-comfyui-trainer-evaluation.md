<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: In-ComfyUI trainer evaluation

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-training-finetune-datasets
**Tags:** training, deferred
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Revisit in-ComfyUI trainer nodes only if the train-outside/infer-inside decision is overturned.

**Context:**
Deferred from the 2026-11-19 MiniMax H3 video workflow research (research doc §8.2, §11.9). The standing decision is train outside ComfyUI (kohya-ss / ai-toolkit) and infer inside; core training nodes are experimental and need dataset versioning, checkpoint management and long-run observability that the prompt→queue→asset shape does not provide. Dataset export is tracked separately in `TASK-DATASET-EXPORT-LAYER-SFT-DPO-IMAGE-AUDIO`. Revisit when core training nodes stabilize and dataset/checkpoint versioning lands.

**Acceptance Criteria:**

- [ ] Trigger: stable core training nodes plus a versioned dataset/checkpoint contract.
- [ ] Comparison with external trainers recorded (quality, VRAM, reproducibility, license) before any node work.
- [ ] No trainer node shipped while the train-outside decision stands.

**Related:**

- `.tmp/research/comfyui-workflows/README.md:84-95`
- `TASK-DATASET-EXPORT-LAYER-SFT-DPO-IMAGE-AUDIO.md`
- `epic-training-finetune-datasets.md`
