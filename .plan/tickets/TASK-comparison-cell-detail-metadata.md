<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison cell detail — full generation metadata and extra_pnginfo import

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-technical-comparison-charts
**Related:** `TASK-comparison-grid-frontend.md`, `TASK-comparison-fan-out-engine.md`, `epic-assistant-generation-extensions.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Clicking a grid cell opens a detail modal showing the complete generation contract for that variant,
the asset dimensions/format, and the ComfyUI `extra_pnginfo` payload when the backend supplied one —
plus provenance links back to the set, the run, and the asset.

## Context

**`extra_pnginfo` is not read anywhere in `src/` today** (verified 2026-10-16 by repo-wide grep).
`ComfyUIOutputFile` (`src/generation/providers/comfyui.ts:44`) carries only
`{ filename, subfolder?, type? }` and `ComfyUINodeOutput` (`src/generation/providers/comfyui.ts:54`) maps
the `images` bucket to `ComfyUIOutputFile[]`. ComfyUI returns `extra_pnginfo` alongside each image
entry in its history/outputs response; this ticket widens `ComfyUIOutputFile` (or the node output type)
to carry an optional `extra_pnginfo` field and threads it from the client through
`generateComfyUI` (`src/generation/image-engine/comfyui.ts`) into `ImageGenOutcome`, so the fan-out
engine (`src/comparisons/fan-out.ts`) can persist it on the variant. sd.cpp has no equivalent, so the
field is optional and the detail modal says "not supplied by this backend" rather than rendering empty.

Dimension/format readout reuses `extractImageMetadata(buffer)` at `src/assets/metadata.ts:236`
(PNG `tEXt`/`zTXt` Description, JPEG COM caption, WebP canvas size, GIF canvas size).

Modal idiom: page-local partials at `src/partials/<feature>/` — copy the structure of
`src/partials/gallery/preview-modal.html` (`modal-overlay` / `modal` / `modal-header` /
`modal-body` / `modal-footer`, `data-testid`). The `window.openModal` / `window.closeModal` /
`window.closeModalOnBackdrop` helpers are **not** in that partial; they are globals invoked from the
page shell, e.g. `window.openModal('upload-modal')` in `hx-on::after-request` at
`src/views/gallery.html:14`. `src/components/asset-preview-modal.html` and
`src/frontend/components/asset-preview-modal.ts` are the shared-asset variant of the same pattern.

**Escaping:** every rendered value here is server- or backend-derived and can contain arbitrary
prompt text and ComfyUI node JSON. Use the established escaping helpers — `esc()` / the
`escape-html` module (`src/routes/views/escape-html.ts`, `src/frontend/html-escape.ts`) and
`escapeJsonForScript` for inline JSON — not raw interpolation. `TASK-svg-upload-leads-to-stored-xss.md`
and the character-edit-form stored-XSS tickets are the standing reminder that this codebase renders
backend-derived strings and has been burned.

Provenance: variant id → set id, run id, asset id, plus the `asset_links` row created by `linkAsset`
(`src/assets/service/links.ts:23`). The `AssetLinkEntity` union (`src/db/enums-content.ts:73`) has no
comparison entry today, so this epic adds a `comparison_set` entry to it and links outputs under that
type — see `TASK-comparison-gallery-comparison-set-integration.md`.

## Acceptance Criteria

- [ ] `ComfyUIOutputFile` (or its node-output wrapper) carries an optional `extra_pnginfo` and a test proves it survives client → engine → outcome
- [ ] `extra_pnginfo` from a fan-out variant is persisted on the variant row and returned by `GET /api/comparison-sets/:id/variants/:variantId`
- [ ] A variant dispatched to sd.cpp (no `extra_pnginfo`) renders an explicit "not supplied by this backend" state, not a blank panel
- [ ] The detail modal shows every variant field plus width/height/format from `extractImageMetadata`
- [ ] The modal shows the set id, run id, asset id, and a working link to `/api/assets/:id/raw`
- [ ] A prompt containing `<script>` and a ComfyUI node payload containing `</script>` both render as inert text (escape test in `src/routes/views/comparisons.test.ts`, which is **owned and created by** `TASK-comparison-grid-frontend.md`; this ticket adds cases to it and does not create a second view test file)
- [ ] Modal partial is at `src/partials/comparisons/cell-detail-modal.html` and is auto-discovered by `discoverPartials`
