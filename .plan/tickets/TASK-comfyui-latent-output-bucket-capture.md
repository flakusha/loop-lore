<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ComfyUI latent output bucket capture

**Status:** In Progress
**Priority:** high
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, comfyui, video
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
loop-lore polls only images/audio/videos/gifs buckets (comfyui-poll.ts:15-20). KJNodes checkpoint output lands in a files bucket and DaSiWa H3 continuity publish emits only a text UI message, so the IVSS run pipeline can never set latent_asset_id (run-pipeline.ts:99,241) even when an H3-aware latent package exists on disk.

**Context:**
Discovered in the 2026-11-19 ComfyUI-side audit. Map the files bucket to a distinct kind, widen ComfyUIOutputKind where needed, and let run-pipeline persist .safetensors/.latent entries via its existing LATENT_FILE_RE. No ComfyUI node change is required for this path.

**Acceptance Criteria:**

- [ ] files bucket entries are returned by pollComfyResult with a non-image kind
- [ ] run-pipeline persists a latent asset from a files-bucket .safetensors entry
- [ ] Existing image/video/audio classification unchanged
