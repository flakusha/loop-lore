<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Model weight-sniffing fallback (detect_from_weights)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** model-metadata-read
**Tags:** models, metadata

**Summary:**

When a checkpoint has no usable `__metadata__`, infer identity/hyperparameters from tensor names and shapes alone: depth/dims/model_type/arch per config class. Fallback tier behind the tensor-key-prefix classifier.

Reference: stable-diffusion.cpp XxxConfig::detect_from_weights(tensor_map, prefix) in src/model/diffusion/{flux,wan,z_image,unet}.hpp; ModelLoader::get_sd_version (src/model_loader.cpp:438); ComfyUI comfy/model_detection.py detect_unet_config state-dict heuristics.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
