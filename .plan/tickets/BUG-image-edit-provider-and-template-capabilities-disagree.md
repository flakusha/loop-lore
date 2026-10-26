<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Image-edit provider and template capabilities disagree

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-comfyui-plugin

**Summary:**

Six places where the advertised capability does not match the implementation.

- src/image-edit/templates/builtin/inpaint.ts:19 — backends: ['comfyui', 'sd-server'] but src/image-edit/providers/sd-server-provider/index.ts:169-171 throws sd-server does not support category: inpaint.
- src/image-edit/providers/sd-server-provider/index.ts:110,115 — capability detection reads controlNetPath and hiresUpscalersDir off ImageProviderConfig, which has neither key; those fields live under autoStart.sdCpp, so the capabilities are never appended.
- src/image-edit/providers/sd-server-provider/ops.ts:119-165 — executeImg2Img reads params.emotion but never calls getEmotionModifier; compare executeTxt2Img at :60-71 which applies it, so img2img renders without the emotion modifier.
- src/image-edit/templates/builtin/upscale.ts:41 — the image param is passed to the ComfyUI LoadImage node, which expects a filename, not base64; client.downloadImage(filename) at comfyui-provider.ts:162 then fails.
- src/image-edit/templates/builtin/lora.ts:20-29 — parseLoraString skips malformed entries silently, with no warn.
- src/image-edit/providers/comfyui-provider.ts:171 — mimeType is built from the raw extension with no toLowerCase(), so .JPG yields image/JPG. Also :158 uses config.assets.uploadDir with no existence or path guard.

Source: .tmp/longcat/review-misc-services.md M5, M6, i3, i4, i5, i7, i10.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 9d307c4 (registry tip: a1bebdc8a Konstantin Fedotov Close issue)
