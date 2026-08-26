<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Gallery Batch Operations

**Status:** ⬜ Not Started
**Priority:** High (MVP scoped, post-Gate C)
**Effort:** Medium
**Type:** Feature Epic / UI
**Tags:** gallery, batch-operations, alpine, ui, assets
**Parent Epic:** Assistant Creative Studio — Workflow Templates (epic-assistant-creative-studio-workflows.md)

> **Standalone UI epic.** No dependency on sibling workflow sub-epics — it only reuses
> the engine's optional workflow modeling for the selection-step schema, and can ship
> before or after them.

## Summary

Multi-select and batch operations for the gallery UI: a selection model in the chat Alpine store, per-item checkboxes with a batch-action bar, and v1 batch operations (download via server-side zip + delete) behind NSFW-rating and ownership gates.

## Design (§7.7)

The gallery UI (`src/frontend/…/gallery-sidebar.html`, `partials/gallery/preview-modal.html`)
renders `galleryAssets[]` with per-item **click-to-preview**, copy-URL, download, delete — but
there is **no selection state**. Batch operations add a selection layer:

- **Selection model** — `selectedAssetIds: string[]` in the chat Alpine store, a **peer array
  to `galleryAssets`** (`src/frontend/alpine/chat-types/core.ts` / `chat-utils/gallery.ts`) so
  Alpine `x-for` iterates it directly (a `Set` would not render — use `[...selectedAssetIds]` if a
  Set is preferred). Toggled via checkbox, shift-click range, "select all visible". UI-only; not
  persisted server-side by default.
- **View (where it renders)** — per-item checkboxes + a batch-action bar are added to
  `src/components/chat/gallery-sidebar.html` (modify), backed by the `selectedAssetIds` state in
  `chat-utils/gallery.ts`. No new component file required for v1.
- **Batch download** — collect selected IDs → `POST /api/assets/batch-download`. Handler lives in
  a new `src/routes/assets.ts` (export `assetsRoutes`, mount in `src/elysia-app.ts` alongside the
  existing inline `POST /api/assets`), returns a server-side zip stream (keeps auth + bandwidth
  local). Client-side zip is a fallback only if the server endpoint is absent.
- **Batch actions (v1 scope: download + delete)** — move-to-world / attach-to-message / tag /
  export are future workflows over the selection set, explicitly out of v1.
- **Gates** — batch download honors NSFW rating visibility (omit/restrict un-consented NSFW) and
  asset ownership/scope.

Step schema (modeled as an optional `gallery-batch` workflow): selection source (current gallery /
search results / world), filters (type, date, rating), action.

## Tasks

- [ ] Gallery batch operations: selection state in Alpine store (`selectedAssetIds`), batch download via `POST /api/assets/batch-download` (zip), v1 batch actions (download + delete), NSFW/ownership gates (§7.7)

Task breakdown (same deliverable, sequenced):

1. Selection model: `selectedAssetIds` peer array in the chat Alpine store; checkbox,
   shift-click range, select-all-visible toggles.
2. Batch-action bar in `gallery-sidebar.html` wired to the selection state.
3. `POST /api/assets/batch-download` handler (`src/routes/assets.ts` → zip stream,
   mounted in `src/elysia-app.ts`) + batch delete.
4. Gates: NSFW rating visibility and ownership/scope enforcement on all batch ops.


- [ ] Gallery edit workflows route to `src/image-edit/` (not the generation pipeline), cover img2img/inpaint/controlnet/upscale/lora, and support `qwen-edit` dual t2i + i2i mode (§7.8)
- [ ] Gallery edit workflows: wrap `src/image-edit/` as workflow UX layer, asset→template binding, edit-capable family presets (flux-kontext, qwen-edit dual t2i/i2i, sdxl + controlnet/lora params), dispatch to `POST /api/image-edit/run` (§7.8)
- [ ] Gallery supports multi-select + batch download (server-zip) with NSFW/ownership gating (§7.7)
- [ ] Default workflows cover media: video generation, image generation, image editing
- [ ] NSFW prefiltering + labeling + consent gate wired for third-party API backends
## Dependencies

- **Parent hub:** Assistant Creative Studio — Workflow Templates (`epic-assistant-creative-studio-workflows.md`)
- **Siblings:** none required — independent of `epic-workflow-engine.md`,
  `epic-model-family-presets.md`, and `epic-entity-generation-workflows.md`.
- **Affinity:** frontend gallery epics — see `epic-frontend-gallery.md` (gallery UI
  surface this extends).

## Related Epics

- `epic-frontend-gallery.md` — base gallery UI
- `epic-nsfw-capabilities.md` — consent/rating infrastructure reused by the gates

> **Bridge:** NSFW ratings/consent/age-gate: see `epic-nsfw-capabilities.md`; moderation enforcement: see `epic-nsfw-moderation-priority.md`.
