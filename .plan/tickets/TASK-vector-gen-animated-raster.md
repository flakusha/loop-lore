<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Vector Gen — Animated Raster (APNG/WebP/GIF)

**Status:** Draft
**Priority:** low
**Effort:** Medium
**Summary:** Assemble APNG/animated-WebP/GIF from generated frame sequences
**Epic:** epic-vector-graphics-generation
**Tags:** assets, animation, generation

## Summary

Add animated-raster generation: prompt N frames via existing `generateImages`,
assemble APNG / animated-WebP / GIF server-side, persist via existing
`persistGeneratedImages`/`createAsset` path reusing `duration_secs` column.
img2vid (Wan/LTX) stays in `epic-multimodal-asset-reuse` Phase 5 — pointer
only, not implemented here.

## Touched Paths

- `src/generation/image-gen-route.ts`
- `src/generation/image-engine/index.ts`
- `src/assets/service/persist-generated.ts`
- `src/assets/service/validate.ts`
- `src/generation/providers/registry.ts`

## Change

1. Frame-sequence request: single prompt × frame count + seed stepping via
   existing `generateImages` (no new provider, no SD failover change).
2. Assembly step: frames → APNG / animated-WebP / GIF with per-frame delay
   and loop count; reuse sharp 256px WebP best-effort thumb for poster.
3. Persist via `persistGeneratedImages`/`createAsset`; reuse `duration_secs`
   column for clip length; mime allowlist extension for animated output
   mimes in `validate.ts`.
4. img2vid handoff: pointer to `epic-multimodal-asset-reuse` Phase 5 only;
   no video-model code in this task.

## Edge Cases

- Frame count 0/1: reject (0) or fall back to still image (1), never emit
  single-frame "animation".
- Mixed frame dimensions: normalize to first frame size before assembly;
  reject sequence if a frame undecodable.
- Oversized assembly (frames × bytes cap): reject before persist, no
  partial asset row.

## Acceptance Criteria

- [ ] N-frame prompt yields one asset servable via `/raw` that animates
  (APNG/WebP/GIF per request), with `duration_secs` set.
- [ ] Gallery preview plays animation; thumb remains still WebP.
- [ ] No video-model (Wan/LTX) code added; img2vid pointer documented only.
- [ ] Failed assembly creates no asset row or orphan file.


git issue: f156320
