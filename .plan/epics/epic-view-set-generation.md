<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Contextual View-Set & Turnaround Generation

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Filed 2026-10-28 (plan branch `plan-creative-3d`) from the creative-3D research package. The orbit-video tier is blocked until the video run seam lands (`epic-video-generation.md`); the image tiers ship without it.
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** views, turnaround, camera, comfyui, edit-models, orbit-video, gallery, assets, assistant

## Overview

loop-lore can generate and edit single images (multi-provider engines,
`src/generation/image-engine/`; ComfyUI templates in `src/image-edit/`) and
stores them with polymorphic links (`src/assets/service/links.ts`), but has
no concept of a **contextually connected set of views of one subject**: no
grouping, no per-view camera data, no turnaround video tier, no gallery
surface that says "these images are the same character at 30° steps", and
no metadata that lets a later stage (3D reconstruction, scene assembly,
re-mix) consume the set as a unit. Reconstruction quality is view-set
quality; this is the prerequisite layer for `epic-3d-generation.md`.

## Goals

- **View-set artifact**: an ordered, lane-labeled group of image (and later
  video-frame) assets plus per-view camera facts, first-class in the data
  model and gallery.
- **Generation tiers** (all through the ComfyUI workflow library, never
  bespoke provider code): (a) edit-model grid passes — local Krea2edit
  (`comfyui-krea2edit` pack), Qwen-Image-Edit 2511 multiangle (Apache-2.0)
  when installed, MV-Adapter nodes; (b) ControlNet-grounded consistent
  views via existing image-edit controlnet templates; (c) orbit/turnaround
  **video** via the video run seam — Wan2.2 camera-control workflows
  through `epic-video-generation.md`'s engine seam — with frame extraction
  into the view set. The orbit tier is blocked until that seam lands.
- **Contextual connection**: view sets link to their subject (character/
  actor/world/location/item via existing `AssetLinkEntity` values) and to
  their source assets (E0b lineage); gallery shows sets as grouped cards
  with camera chips; sets embed regeneration manifests (E0a).
- **Reference reuse**: any existing asset (avatar, item art, location art)
  is pickable as the subject/reference input (asset-id upload contract,
  `src/image-edit/providers/comfyui-image-upload.ts` pattern).
- **Assistant tier**: a `view-set` workflow template (subject pick → tier →
  camera plan → confirm → dispatch) on the existing runner
  (`src/assistant/workflow-runner.ts` family), plus a VLM consistency gate
  (aux-pipeline critique: "are these views the same subject?") that can
  reject/regenerate individual views before the set is marked complete.

## Data/model sketch

- `AssetLinkEntity` gains a `ViewSet` value (link-based surfacing of the
  set as an entity), per the established enum-extension pattern
  (`src/db/enums-content.ts`).
- New `view_sets` table: `id`, `owner_id`, `subject_type`+`subject_id`
  (polymorphic anchor), `title`, `tier` (edit_grid | controlnet |
  orbit_video), `camera_plan` JSON (azimuth/elevation steps or trajectory
  descriptor), `status` (draft | generating | complete | failed), audit
  columns + `record_hash` (repo pattern `src/hash/record-hash.ts`).
- New `view_set_items`: `set_id`, `asset_id`, `sort_order`, `lane`
  (semantic: canonical | variant | detail | extracted_frame), `camera`
  JSON (azimuth, elevation, fov, optional intrinsics+c2w+convention),
  `source_asset_id` (lineage), audit columns.
- Generation facts + lineage ride `epic-asset-generation-metadata.md` /
  `epic-asset-lineage-provenance.md`; the set itself is an asset-linked
  group, not a new binary type.

## Surface sketch

- Gallery: set cards (stacked thumbnails, camera chips, "open set" modal
  reusing the media-preview modal family,
  `src/components/chat/media-preview-modal.html`).
- Subject pages (character/world/location detail): "view sets" section.
- Assistant: `workflow-preview`/`workflow-progress` message actions already
  exist; new dispatch backend `generation-viewset` registered through the
  workflow-engine family (NOT a new runner).
- Rate limiting: run suffix joins the generation policy
  (`src/api-governance/rate-limiting/policies.ts`).

## Relations (existing epics)

| Epic | Relation |
| ---- | -------- |
| `epic-asset-generation-metadata.md` | Camera facts captured at write; embedded regeneration manifests |
| `epic-asset-lineage-provenance.md` | Source-asset links, stale propagation |
| `epic-comfyui-first-class-citizen.md` | Workflow library is where grid workflows land; UI→API converter owned there |
| `epic-comfyui-plugin.md` | Transport + asset-id upload |
| `epic-comfyui-lifecycle.md` | Provisions the local engine the edit-model node packs run on |
| `epic-reference-conditioned-generation.md` | Lanes map onto its request model — no second reference vocabulary |
| `epic-reactive-actor-appearance.md` | Identity machinery (seed/init/edit strategy) turnaround passes ride on |
| `epic-video-generation.md` | Orbit tier blocked until its video run seam lands |
| `epic-asset-platform-capabilities.md` | Renditions host set cards; backlinks surface consumers |
| `epic-frontend-gallery.md` | Set cards + camera chips |
| `epic-gallery-batch-operations.md` | Set-membership filter composes with batch selection |
| `epic-workflow-engine.md` | `generation-viewset` dispatch backend + asset-pick step |
| `epic-sam3-segmentation-integration.md` | Cutouts as view-set inputs |
| `epic-derived-map-generation.md` | Depth maps as view conditioning |

## Tickets (this epic)

| Ticket | Scope | Depends on |
| ------ | ----- | ---------- |
| `TASK-view-set-schema-and-links` | `view_sets`/`view_set_items` migration + `AssetLinkEntity.ViewSet` + enums | — |
| `TASK-view-set-crud-and-gallery-surface` | Routes + TypeBox schemas + gallery set cards + set modal | schema |
| `TASK-view-set-edit-grid-workflows` | Three grid tiers as workflow-library rows with var maps | schema, E0a camera facts |
| `TASK-view-set-orbit-video-tier` | Orbit video dispatch + frame extraction; **blocked until the video run seam lands** | edit-grid, `epic-video-generation.md` |
| `TASK-view-set-camera-conventions-and-export` | Camera JSON utils, OpenCV↔OpenGL, COLMAP/nerfstudio export | schema |
| `TASK-view-set-consistency-gate` | Aux-pipeline VLM consistency critique with per-item verdicts | CRUD |
| `TASK-view-set-assistant-workflow` | `view-set` workflow template + dispatch backend registration | CRUD, workflows EXT |

## Open questions

- **Video Scenario Studio (VSS):** a draft Director-run-pipeline epic
  (not yet filed) was evaluated as the preferred orbit-tier backend; its
  acceptance is pending. Until it files, the orbit tier targets the
  Wan camera-control workflow seam in `epic-video-generation.md`; if VSS
  files later, the tier's dispatch migrates to it (the frame-extraction
  contract is backend-agnostic).
- **Camera plan authoring UX:** free-form step list vs a preset arc
  (front/side/back 8-view default). Start with presets; free-form later.
- **Set size caps:** grid tiers bounded by the workflow's angle list;
  enforce a sane maximum at validation time.

## Non-goals

- 3D reconstruction itself (`epic-3d-generation.md`); scene/environment
  generation (`epic-scene-environment-world-generation.md`); engine export
  (`epic-game-asset-pipeline-export.md`).
- A new video generation engine or stitching (owned by
  `epic-video-generation.md`); this epic only consumes those seams.
- A second reference-conditioning vocabulary — lanes map onto the
  `epic-reference-conditioned-generation.md` request model.
- New frontend frameworks; surfaces follow the htmx+Alpine page/panel
  conventions.

## Related

- [`TASK-view-set-schema-and-links.md`](../tickets/TASK-view-set-schema-and-links.md)
- [`TASK-view-set-crud-and-gallery-surface.md`](../tickets/TASK-view-set-crud-and-gallery-surface.md)
- [`TASK-view-set-edit-grid-workflows.md`](../tickets/TASK-view-set-edit-grid-workflows.md)
- [`TASK-view-set-orbit-video-tier.md`](../tickets/TASK-view-set-orbit-video-tier.md)
- [`TASK-view-set-camera-conventions-and-export.md`](../tickets/TASK-view-set-camera-conventions-and-export.md)
- [`TASK-view-set-consistency-gate.md`](../tickets/TASK-view-set-consistency-gate.md)
- [`TASK-view-set-assistant-workflow.md`](../tickets/TASK-view-set-assistant-workflow.md)
- [`epic-asset-generation-metadata.md`](./epic-asset-generation-metadata.md) — metadata spine
- [`epic-asset-lineage-provenance.md`](./epic-asset-lineage-provenance.md) — lineage
- [`epic-3d-generation.md`](./epic-3d-generation.md) — primary consumer
- [`epic-video-generation.md`](./epic-video-generation.md) — orbit seam
- [`epic-workflow-engine.md`](./epic-workflow-engine.md) — dispatch backends

git issue: 0175a3a
