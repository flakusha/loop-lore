<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Image-edit concept inpaint template

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** sam3-segmentation-integration
**Tags:** image-edit, comfyui
**Depends on:** `TASK-comfyui-sam3-concept-mask-template`, `TASK-comfyui-first-class-mount-image-edit-routes-verify-asset-per`
**Related:** BUG-comfyui-edit-provider-persists-nothing-ownerid-system-violat.md, BUG-image-edit-derivative-link-files-an-asset-id-under-entity-ty.md, epic-assistant-generation-extensions.md (§ /image edit)

**Summary:**

`concept-inpaint` — inpaint the region SAM3 selects for a concept ("remove the character holding the lantern"), routed and authorized like every other image-edit run.

**Context:**

The builtin inpaint template exists but its mask is hand-authored; this adds a runtime concept mask on top of `TASK-comfyui-sam3-concept-mask-template`. Ownership and chat-access scoping go through `src/image-edit/run-authz.ts`; the result persists as a derivative asset — watch the `entity_type` trap from BUG-image-edit-derivative-link and the dedup-collapse lessons from the asset-platform defect batch.

**Acceptance Criteria:**

- [ ] Template registered: `image_asset` + `concept` + `prompt` params; SAM3 mask feeds the inpaint nodes; result persisted via the edit provider's existing createAsset/linkAsset path
- [ ] Parameter form renders `concept` as a text input (reuse the `TemplateParameter` shape in `src/image-edit/types.ts`)
- [ ] `concept` validated at the **boundary by a reused schema** (bounded length + charset), fast-failing 400 before any provider call or asset write — not an ad-hoc per-handler check; the same schema covers the assistant `/image edit` entry point (no bypass twin)
- [ ] Route honors image-edit authz (`src/image-edit/run-authz.ts`): actor ownership + chat access confirmed before the run; unauthorized → 403, invalid input → 400, never 500
- [ ] Derivative link uses the corrected entity type; dedup does not collapse two different concepts onto one asset
- [ ] Test: full route run against the fake ComfyUI server; result linked to the source; a second run with a different concept yields a distinct derivative
- [ ] `bun run check` green

## Technical Notes

- Follow the existing `/api/v1/image-edit/*` route shape and the parent-app multipart pattern (`src/assets/controller.ts` `handleUpload`) if a route needs file upload.
