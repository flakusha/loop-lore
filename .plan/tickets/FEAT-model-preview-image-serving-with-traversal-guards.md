<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Model preview image serving with traversal guards

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-local-model-file-discovery
**Tags:** models, previews, security

**Summary:**

Serve model preview images: (1) sibling images with the same basename or `<name>`.preview.* next to the model file, (2) base64 covers embedded in the safetensors header `__metadata__.ssmd_cover_images` (kohya-style). Preview endpoint must guard against path traversal and symlink escapes (is_within_directory check) and is keyed by category + path index + filename.

Reference: ComfyUI app/model_manager.py get_model_previews + /experiment/models/preview/{folder}/{path_index}/{filename} route; Stability Matrix LocalModelFile.PreviewImageRelativePath.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
