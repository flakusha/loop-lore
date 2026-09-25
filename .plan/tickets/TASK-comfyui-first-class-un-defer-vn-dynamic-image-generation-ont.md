<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI first-class: un-defer VN dynamic image generation onto ComfyUI

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-visual-novel-mode
**Tags:** comfyui, vn

**Summary:** Wire the deferred VN image step onto `generateComfyUI`: scene backgrounds + emotion portrait variants, cached by (scene_hash, emotion), with backend-down fallback.

**Context:**

`epic-visual-novel-mode.md` Current State: story generation ✅, choice generation ✅, image generation ❌ deferred ('uses ComfyUI' — no path). Meanwhile the engine to run it already ships: `generateComfyUI` (src/generation/image-engine/comfyui.ts, 68L) loads `configs/workflows/{txt2img,img2img}.json`, substitutes `{{prompt}}`/`{{width}}`/`{{seed}}` etc., injects LoRA, returns buffers; `pickSdProvider(providers, 'generate')` (src/config/schema/sd-provider.ts) already selects the generate-purpose provider. VN scenes (`VnScene`: backgroundUrl, cast, speakerId, emotion) map 1:1 onto txt2img params + portrait variants.

## Implementation

1. `src/routes/vn-generate/` image step: after story/choice gen, resolve provider via `pickSdProvider(cfg, 'generate')`; if `apiFamily === 'comfyui'`, call `generateComfyUI` with scene prompt (location/scene description + style) → persist via existing asset path → set `backgroundUrl`. Non-comfyui providers: keep current behavior (no regression).
2. Portrait variants: character data + `emotion` key → per-emotion workflow run → feeds `sprite-stage.ts` `emotionVariants` map. Cache key `(scene_hash, emotion)` in assets — never regenerate a cached variant.
3. Pre-generation hook: on scene transition trigger, enqueue background + roster portraits ahead of render (best-effort, failures fall back to stored background).
4. Backend-down fallback: serve last stored background/portrait, surface degraded indicator (never blank stage).

**Acceptance Criteria:**

- [ ] VN story image step generates via ComfyUI when generate-provider is comfyui
- [ ] Emotion variants cached by (scene_hash, emotion); cache hit skips generation
- [ ] Backend down → stored background served, stage never blank
- [ ] Tests: route-to-engine wiring, cache-hit short-circuit, fallback path
- [ ] Documentation updated (epic-visual-novel-mode Current State: image generation ✅)
