<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI first-class: un-defer VN dynamic image generation onto ComfyUI

**Status:** Not Started
**Priority:** medium
**Effort:** Medium (provider pick + cache + fallback)
**Summary:** VN story image step routes to `generateComfyUI` via `pickSdProvider`, keyed by `(scene_hash, emotion)` cache with backend-down fallback, removing the ComfyUI defer in VN dynamic generation.
**Context:** First-Class Program step (`epic-comfyui-plugin.md`); serves `epic-visual-novel-mode`. VN scene images currently defer ComfyUI as a provider; first-class support means VN participates in the same provider ladder as other image surfaces.

**Acceptance Criteria:**
- [ ] `pickSdProvider` can select ComfyUI for VN story image steps.
- [ ] `(scene_hash, emotion)` cache prevents duplicate generation for unchanged scenes; hit path returns the existing asset.
- [ ] Backend-down fallback routes to the next provider (or degrades gracefully) without failing the VN turn.
- [ ] Tests: cache hit/miss, provider pick, fallback path.
- [ ] `bun run check` green.

**Epic:** epic-comfyui-plugin
**Tags:** comfyui, vn, visual-novel, image-generation, provider-ladder
**Related:** epic-visual-novel-mode, TASK-comfyui-first-class-mount-image-edit-routes-verify-asset-per


git issue: 008910d
