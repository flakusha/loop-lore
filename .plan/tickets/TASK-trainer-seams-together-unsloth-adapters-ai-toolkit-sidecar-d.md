<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: trainer seams: Together/Unsloth adapters + ai-toolkit sidecar + DPO-on-swipes template

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-training-finetune-datasets
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Learning-slice build order from .tmp/research/external-brains/04-learning.md. TrainingProvider abstraction + job records exist (forward-migration ticket); dataset-export + val-split/fingerprint exist. Missing: ONE trainer seam each — Together adapter (text; OpenAI FT winding down) + sidecar-to-ai-toolkit (image, FLUX-family YAML, artifacts land in existing LoRA discovery + ComfyUI/sd.cpp injection, zero new inference plumbing). Local LLM (Unsloth QLoRA) and Replicate only on validated demand. DPO-on-swipes is the proportionate preference start (TRL DPOTrainer thin wrapper); GRPO overkill pre-eval-harness. Datasets pinned: PIPPA (actor SFT seed, Apache-2.0), UltraFeedback/HH-RLHF (DPO pairs), LAION-aesthetics (local score-only), COCO captions (retrieval eval, text-only). TTS: Fish Speech zero-shot, no finetune lane.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
