<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ComfyUI output kind by format

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, comfyui, video
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Core ComfyUI SaveVideo reports video into the images history bucket (comfy_extras/nodes_video.py:206 -> comfy_api/latest/_ui.py:430-431), but loop-lore maps images unconditionally to image (comfyui-poll.ts:15-20). The IVSS run pipeline therefore fails with 'ComfyUI workflow produced no video output' on a valid mp4. Classify by node marker (animated) / file format / extension with bucket fallback, keeping DaSiWa gifs and videos behaviour.

**Context:**
Discovered in the 2026-11-19 ComfyUI-side audit of tree/full-cycle-director @ 4351844de. This is a real interop defect with stock ComfyUI SaveVideo, not a node-pack gap. DaSiWa EnhancedVideoCombine emits gifs, which already maps to video.

**Acceptance Criteria:**

- [ ] images bucket with animated marker or video extension maps to video
- [ ] gifs and videos buckets still map to video; plain images still map to image
- [ ] Regression test covers core SaveVideo-shaped history payload and DaSiWa-shaped payload
