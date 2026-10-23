<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Tensor-key-prefix model classifier

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-model-metadata-read
**Tags:** models, classification

**Summary:**

Classify model files (checkpoint/lora/vae/text-encoder/unknown) by matching safetensors/GGUF tensor-key prefixes against curated per-architecture tables (SD1/SD2/SDXL/SD3/Flux/Flux2/Wan/HiDream/Z-Image unet prefixes; vae prefixes; text-encoder prefixes). Runs on header data only, no weight load; feeds category validation, LoRA base matching, and frontend badges.

Reference: Stability Matrix StabilityMatrix.Core/Helper/SafetensorClassifier.cs ClassifyAsync (UnetTensorPrefixes/VaeTensorPrefixes/TextEncoderTensorPrefixes -> SafetensorCheckpointKind, 100MB header cap); stable-diffusion.cpp src/model/model.h sd_version_is_* predicates; ComfyUI comfy/model_detection.py detect_unet_config.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
