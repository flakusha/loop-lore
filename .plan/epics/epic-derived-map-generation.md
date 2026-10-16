<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Derived-Map Generation — Depth, Textures, Multi-Mask, Provenance

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** Low
**Effort:** High
**Type:** Generation Epic
**Tags:** depth, texture, pbr, segmentation, assets, gallery, comfyui

## Overview

Second-order generation derivatives on top of an image: **depth maps**, **PBR
texture sets** (albedo / normal / roughness), **multi-mask segmentation**
(one concept → many instance masks), and the plumbing that makes those useful —
**origin links** (image → derived) and **gallery filters** for generated and
derived content.

Everything here reuses the seams already settled by
[`epic-comfyui-plugin.md`](./epic-comfyui-plugin.md) (workflow JSON is the API
contract; templates render into the in-place registry) and
[`epic-sam3-segmentation-integration.md`](./epic-sam3-segmentation-integration.md)
(concept segmentation contract). It is the consumer side of that work.

## Why derived maps, here (grounded in current code)

| Seam | Today | With this epic |
| ---- | ----- | -------------- |
| Depth estimation | Absent. `controlnet` template accepts a `control_image` but generates from `EmptyLatentImage` (`src/image-edit/templates/builtin/controlnet.ts:20-38`) — no image→depth path anywhere in `src/` | `depth-estimation` template: image in, depth PNG out, stored as a derivative (`TASK-comfyui-depth-map-generation-template`) |
| Depth-conditioned editing | ControlNet guidance is generate-only; `img2img` has no control image at all | `controlnet` gains an input-image latent so "transform this shot" works (`TASK-image-edit-depth-conditioned-editing`) |
| Texture sets | No albedo/normal/roughness generation; 3D vision epic has no material source (`epic-3d-generation.md`) | One prompt → three linked map derivatives (`TASK-comfyui-pbr-texture-set-generation`) |
| Multi-mask | `MattingProvider.removeBackground` returns one `Buffer` (`src/generation/matting/types.ts:37`); `findMattedDerivative` returns the newest single row (`src/assets/matting-routes.ts`) | Concept → N instance masks, N derivatives, list reads (`TASK-multi-concept-segmentation-masks`) |
| Origin / provenance | asset→asset links exist but only matting writes them, with the single label `MATTING_SOURCE_LABEL` (`src/generation/matting/service.ts:34,211-219`); nothing displays origin | Generic `derived-from:<kind>` label scheme + read API + preview slot (`TASK-derived-map-origin-links`) |
| Gallery | Filters are entityType/entityId/tag only (`src/routes/views/gallery.ts:16-56`); search adds `type`/`q`/`sort` | `kind`/`derived` filter for generated vs uploaded vs derived content (`TASK-gallery-filter-generated-derived-content`) |

**Engine scope:** ComfyUI-only for v1. Depth estimation, control-image
conditioning, and custom-node graphs need `/object_info` ingest validation; the
sd-server provider throws for controlnet categories outright
(`src/image-edit/providers/sd-server-provider/index.ts`). sd-server support is a
separate epic if ever.

## Relations (existing epics)

| Epic | Relation |
| ---- | -------- |
| `epic-sam3-segmentation-integration.md` | Concept masks are the input to multi-mask and to texture conditioning; the mask contract extension lands here |
| `epic-comfyui-plugin.md` | Hosts every template: client, registry, `/object_info` ingest validation, asset storage |
| `epic-comfyui-first-class-citizen.md` | Prerequisite defects (numeric substitution, node-id allocation) block multi-node graphs here too |
| `epic-asset-platform-capabilities.md` | Owns derivative storage, content-hash dedup, `asset_links` semantics; origin links extend, never replace, its contract |
| `epic-2d-sprite-world.md` | Its `parallax_factor` is UI-layer map scrolling, not image depth — depth maps would be a new consumer, not a current one |
| `epic-3d-generation.md` | Texture sets are the only realistic material source for its mesh pipeline |
| `epic-frontend-gallery.md` | Gallery grid/search render the new filter; filter seam lives in its `applyGalleryAssetFilters` |
| `epic-gallery-batch-operations.md` | Batch ops gain "regenerate maps" as a workflow category once templates exist |
| `epic-e2e-integration-testing.md` | Fake-ComfyUI server pattern covers depth/fixture graphs deterministically |
| `epic-byok-local-models.md` | Local ZoeDepth/MiDaS weights would be the same sidecar boundary as local SAM weights — not this epic |

## Tickets (this epic)

| Ticket | Scope | Depends on |
| ------- | ----- | ---------- |
| `TASK-comfyui-depth-map-generation-template` | `depth-estimation` template + ingest validation + derivative storage | `TASK-comfyui-workflow-parameterization`, `TASK-comfyui-node-id-allocation` |
| `TASK-image-edit-depth-conditioned-editing` | ControlNet from an input image (input-latent variant) | depth template |
| `TASK-comfyui-pbr-texture-set-generation` | One prompt → albedo/normal/roughness derivative set | origin links |
| `TASK-multi-concept-segmentation-masks` | Concept → N masks end to end | `TASK-matting-concept-prompt-contract` |
| `TASK-derived-map-origin-links` | Generic `derived-from:<kind>` label scheme + read API | — |
| `TASK-gallery-filter-generated-derived-content` | `kind`/`derived` gallery filters + provenance display | origin links |

## Open questions

- **Depth model choice:** ZoeDepth vs MiDaS custom node — accuracy, output
  range (relative vs metric), license. Settled by the depth template ticket's
  probe leg, recorded before implementation.
- **Normal-map direction:** derive from the depth map (heightmap → sobel) or a
  dedicated normal-estimation node. Default: sobel derivation, fewer custom
  nodes in the graph.
- **PBR v1 surface:** albedo + normal + roughness only (no metallic/AO/height)
  unless the 3D epic asks for more.
- **Instance ordering:** when a concept matches N objects, masks are ordered by
  area descending; stable ids come from the cache ticket's key, not this epic.

## Non-goals

- Video depth or per-frame depth tracking.
- sd-server depth/controlnet support (throws for controlnet categories today).
- Metric/absolute depth, LiDAR-grade accuracy.
- Auto-captioning or a caption-skip flag: captioning already exists
  (`handleImageCaption` in `src/generation/caption-route.ts`) and is invoked
  per asset — "never call it" is the skip, `assets.alt_text` is already
  nullable (`src/db/schema-content.ts`). Filed separately only if a batch path
  ever forces captions on.
- Training or fine-tuning depth/segmentation weights.

## Related

- [`TASK-comfyui-depth-map-generation-template.md`](../tickets/TASK-comfyui-depth-map-generation-template.md)
- [`TASK-image-edit-depth-conditioned-editing.md`](../tickets/TASK-image-edit-depth-conditioned-editing.md)
- [`TASK-comfyui-pbr-texture-set-generation.md`](../tickets/TASK-comfyui-pbr-texture-set-generation.md)
- [`TASK-multi-concept-segmentation-masks.md`](../tickets/TASK-multi-concept-segmentation-masks.md)
- [`TASK-derived-map-origin-links.md`](../tickets/TASK-derived-map-origin-links.md)
- [`TASK-gallery-filter-generated-derived-content.md`](../tickets/TASK-gallery-filter-generated-derived-content.md)
- [`epic-sam3-segmentation-integration.md`](./epic-sam3-segmentation-integration.md) — concept-mask producer
- [`epic-comfyui-plugin.md`](./epic-comfyui-plugin.md) — template + engine host
- [`epic-asset-platform-capabilities.md`](./epic-asset-platform-capabilities.md) — derivative storage owner
- [`epic-2d-sprite-world.md`](./epic-2d-sprite-world.md) — UI parallax ≠ image depth today
- [`epic-3d-generation.md`](./epic-3d-generation.md) — material consumer
- [`epic-frontend-gallery.md`](./epic-frontend-gallery.md) — filter rendering surface


git issue: 48d5913
