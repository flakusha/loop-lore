<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Local Model File Discovery

**Overview:** (see sections below)


**Status:** Not Started
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** models, discovery, scanning, safetensors, gguf, sd, llama, file-indexing

## Summary

Server-side scanning of the user's local model directories into a category-aware index: `{category → [dirs] + allowed extensions}` registry with legacy-name aliasing, mtime-cache incremental rescans, an `extra-model-paths` YAML config (base_path + env expansion + per-category subpaths), and preview-image serving with path-traversal guards. Today safetensors/gguf paths exist only as config strings (`src/config/schema/auto-start.ts`, `config/sections/sd.ts`); nothing walks a models directory or indexes what it finds. Port-probe backend discovery (`src/services/sd-discovery.ts`) and the provider capabilities registry (`src/admin/model-capabilities.ts`) are out of scope / already exist.

Reference implementations: ComfyUI `folder_paths.py` (category registry, `recursive_search` + mtime cache, `map_legacy` aliasing, `is_within_directory`), ComfyUI `utils/extra_config.py:load_extra_path_config` + `app/model_manager.py` (`ModelFileManager` routes, `get_model_previews`), Stability Matrix `StabilityMatrix.Core/Services/ModelIndexService.cs` (DB-backed index, hash-set dedupe, incremental refresh).

## Scope

- Category registry: checkpoints / loras / vae / text_encoders / diffusion_models / embeddings / controlnet, each with dir list + extension set; legacy aliases (`unet`→`diffusion_models`, `clip`→`text_encoders`).
- mtime-cache recursive listing: re-list a category only when any dir mtime changed; API endpoints for categories + per-category file listing.
- `extra-model-paths` YAML: `base_path` (expanduser/expandvars, resolved against the yaml's dir), per-category newline-separated subpaths, repeatable config files.
- Preview images: sibling `<name>.preview.*` / same-basename images and header-embedded covers (`__metadata__.ssmd_cover_images`); served via a guarded preview endpoint (traversal + symlink checks).

Out of scope: header metadata parsing (see `epic-model-metadata-read.md`), frontend display (see `epic-model-info-frontend.md`), remote/civitai download.

## Related tickets

- `FEAT-model-category-registry-with-mtime-cache-listing.md`
- `FEAT-extra-model-paths-yaml-config.md`
- `FEAT-model-preview-image-serving-with-traversal-guards.md`

## Acceptance Criteria

- [ ] Category registry maps every category to dirs+extensions with legacy aliases resolving
- [ ] Category listing API reflects new/removed files on next request without a restart (mtime cache)
- [ ] `extra-model-paths` YAML merges additional dirs with env-var expansion and yaml-relative base_path
- [ ] Preview endpoint serves sibling + embedded-cover previews and rejects traversal/symlink escapes


git issue: ae64753
