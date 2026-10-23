<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Model category registry with mtime-cache listing

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-local-model-file-discovery
**Tags:** models, discovery, scanning

**Summary:**

Add a server-side {category -> [dirs] + allowed extensions} model registry (checkpoints/loras/vae/text_encoders/diffusion_models/embeddings/controlnet) with legacy aliasing (unet->diffusion_models, clip->text_encoders), recursive listing per category, and API endpoints for categories + per-category files. Incremental refresh: re-list a category only when any directory mtime changed.

Reference: ComfyUI folder_paths.py (folder_names_and_paths, map_legacy, recursive_search + cached_filename_list_, is_within_directory); ComfyUI app/model_manager.py ModelFileManager routes (/experiment/models, /experiment/models/{folder}); Stability Matrix ModelIndexService.cs (DB-backed index, refresh).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
