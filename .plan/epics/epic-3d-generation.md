<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: 3D Reconstruction & Model Management

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Filed 2026-10-28 (plan branch `plan-creative-3d`). This file was the "3D Asset Generation (Future)" vision stub (Meshy/TripoSR-era provider table, Three.js-only plan); the creative-3D rewrite **supersedes that scope in place**. The umbrella ticket `TASK-3d-generation.md` remains attached as the epic's umbrella and is superseded-in-scope by the phase tickets below (not closed — it tracks the epic file itself). The stub's device-tier gating caveat and 2D-fallback requirement are kept.
**Priority:** Medium
**Effort:** XL
**Type:** Feature Epic
**Tags:** 3d, reconstruction, gaussian-splatting, photogrammetry, mesh, pbr, rigging, feedback-loop, comfyui, model-viewer

## Overview

The superseded stub's plan predates the current landscape: ComfyUI now
ships a **native 3D suite** (TRELLIS.2 + Pixal3D generation, mesh
post-processing, UV/PBR bake, full splat node set) and MIT/Apache clean
local tooling exists for every stage (gsplat, COLMAP, trimesh, UniRig,
Material Anything). loop-lore has **no** 3D asset type, no reconstruction
pipeline, no model handling (repair/texturing/rigging), no render-judge
feedback loop, no 3D display, and no open-in-editor path. Meanwhile the
platform's RPG content (characters, items, locations — and soon
`epic-view-set-generation.md` view sets) is exactly the input these tools
consume.

> ⚠️ **Performance caveat (kept from the stub):** 3D display requires
> WebGL2/GPU. All 3D features MUST be progressive enhancement: capped at
> device tier, default off, 2D poster fallback.

## Goals

1. **3D asset model**: `AssetType` gains `model3d` (format-discriminated:
   glb/gltf/ply/spz/usdz via metadata, one type — no per-format types);
   serving, thumbnails/posters (rendition ladder), ownership/encryption
   parity with image assets.
2. **Reconstruction pipelines** (ComfyUI-first, operator-supplied
   workflows):
   - *feed-forward*: TRELLIS.2 / Pixal3D native nodes (MIT) from a single
     image or an E1 view set (multi-image conditioning); Hunyuan3D-Wrapper
     tier explicitly **optional and license-fenced** (Tencent community
     license: EU/UK/KR restrictions, MAU clause) — never a default.
   - *photogrammetry/splats*: external-binary tier — COLMAP (SfM) + gsplat
     (Apache-2.0 trainer) + nerfstudio transforms ingestion; sparse-view
     research tier (InstantSplat-class) flagged experimental;
     capture-import tier: ingest PLY/SPZ exports from Postshot/Polycam/
     Scaniverse.
3. **Model handling/management**: post-processing chain — mesh QA
   (trimesh/pymeshlab tier) → repair/decimate/UV/PBR bake (ComfyUI native
   nodes + Blender `--background` as external step) → texturing (Material
   Anything MIT default; CHORD research-only, config-gated) → rig attach
   (UniRig MIT local; Mixamo as user-driven external; glTF
   skins/animations preserved). Resource attachments (textures/rigs/
   animations) stored as linked assets with lineage.
4. **Automated feedback loop**: render → judge → adjust. Tier 1
   deterministic QA (watertight, degenerate faces, poly budget); tier 2
   preference score (ImageReward/HPSv2 class, same-prompt comparisons
   only); tier 3 VLM critique (aux-pipeline or in-graph QwenVL verifier
   pattern) returning structured verdicts → parameter/workflow adjustments
   → re-run, under the existing flow-control/cancellation machinery and
   the assistant's confirmation gates.
5. **In-app display** (keeps the stub's device-tier gating + 2D fallback):
   `<model-viewer>` (lazy-loaded via htmx `revealed` partials) for
   meshes/animations; three.js native Gaussian Splatting addon / gsplat.js
   for splats (SPZ v4 storage, PLY interchange); surfaces: asset preview
   modal, gallery cards, character/location detail, blog embeds.
6. **External editor integration**: "open in Blender/Krita/(Substance)"
   actions exporting the asset + manifest to a watched working dir; see
   `epic-external-creative-tool-bridge.md` (bridge owns the machinery).

## Non-goals

- A bespoke 3D generation provider SDK — generation rides the ComfyUI
  client + workflow library; external binaries are probed, not embedded
  (provisioning pattern decision → open questions).
- Scene/world generation (`epic-scene-environment-world-generation.md`)
  and engine export packaging (`epic-game-asset-pipeline-export.md`); the
  VRM avatar subsystem from the old stub narrows to "glTF skins/animations
  preserved + model-viewer playback" (expression rigs → future revision).
- Training/fine-tuning any weights; hosting NC/research-only models as
  defaults; real-time collaborative editing.
- Replacing VN 2D rendering — 3D display is progressive enhancement per
  the superseded stub's own caveat.

## Data/model sketch

- `AssetType.Model3D` + MIME/detect entries (`model/gltf-binary`,
  `model/ply`, `application/octet-stream`+magic for spz — magic-byte
  checks per repo validation conventions).
- `reconstruction_runs` (job-records pattern, DB-backed — the shape used
  by `src/characters/services/emotion-avatar-service/job-records.ts`):
  `id`, `owner_id`, `pipeline` (trellis2 | pixal3d | hunyuan_wrapper |
  colmap_gsplat | capture_import), `input` JSON (source asset ids /
  view_set id / capture manifest), `params` JSON (workflow id + vars +
  seed), `status` machine (queued | running | judging | complete | failed
  | canceled — StateDef pattern `src/db/state.ts`), `output_asset_id`,
  `judge_verdicts` JSON, error text, audit columns.
- Post-processing steps recorded as lineage edges (E0b) with per-step
  provenance (`blender:decimate`, `comfy:uv_pbr_bake`, `unirig:rig`).
- Asset link entities: reuse Character/Actor/Location/Item/World/Asset —
  no new enum values needed for E2 core (ViewSet link already added by
  `epic-view-set-generation.md`).

## Surface sketch

- 3D viewer partial (model-viewer / splat canvas) mounted in
  media-preview modal + gallery cards + detail pages; poster-first,
  `revealed` lazy load; device-tier gate default-off with 2D poster
  fallback.
- "Reconstruct in 3D" action on any image/view-set (assistant command +
  detail-page button) → run pipeline → job status (poll; `/ws` when the
  comfyui-plugin epic lands) → result asset attached.
- Model management panel per 3D asset: QA report, post-process actions
  (repair/decimate/bake/rig), judge verdicts history, open-in-editor.

## Relations (existing epics)

| Epic | Relation |
| ---- | -------- |
| `epic-asset-generation-metadata.md` | 3D run facts captured at write; embedded glTF manifests |
| `epic-asset-lineage-provenance.md` | Post-processing steps as lineage edges |
| `epic-view-set-generation.md` | View sets are the multi-image input; COLMAP/nerfstudio export comes from its conventions task |
| `epic-comfyui-first-class-citizen.md` | 3D workflows are library rows, not bespoke code |
| `epic-comfyui-plugin.md` | Transport; `client_id`/`/ws` progress for long runs |
| `epic-comfyui-lifecycle.md` | Custom-node dependency reconciliation for the 3D packs |
| `epic-derived-map-generation.md` | PBR texture sets consumed, not duplicated |
| `epic-sam3-segmentation-integration.md` | Mask-conditioned reconstruction, texture isolation |
| `epic-asset-platform-capabilities.md` | Rendition ladder for 3D posters/thumbs |
| `epic-external-creative-tool-bridge.md` | Editor round-trip (E2 owns export + re-ingest acceptance) |
| `epic-external-tooling-build.md` | External-binary provisioning pattern (build-only, pinned-ref) |
| `epic-generation-flow-control.md` | Hold/cancel for long reconstruction runs |
| `epic-embeddable-engine-game-frontend.md` | Display spike cross-ref |
| `epic-immersion-presentation.md` | `TASK-3d-view-modes` deferred row — align at pickup |

## Tickets (this epic)

Phase-ordered; the umbrella `TASK-3d-generation.md` stays attached to the
epic file and is superseded-in-scope by these tickets.

| Ticket | Phase | Scope | Depends on |
| ------ | ----- | ----- | ---------- |
| `TASK-3d-asset-type-and-serving` | A | `AssetType.Model3D`, detect/validate, serve parity, renditions | — |
| `TASK-3d-frontend-viewer-lazy-mount` | A | Viewer partials, revealed mount, tier gate, poster fallback | asset type |
| `TASK-reconstruction-run-jobs` | A | `reconstruction_runs` table + state machine + routes + flow control | asset type |
| `TASK-trellis2-view-set-pipeline` | B | TRELLIS.2/Pixal3D workflow tier (single image or view set) | run jobs, view sets |
| `TASK-hunyuan-optional-fenced-tier` | B | License-fenced optional Hunyuan3D wrapper tier | run jobs |
| `TASK-photogrammetry-external-tier` | B | COLMAP+gsplat external binaries + capture import | run jobs, camera conventions |
| `TASK-mesh-qa-and-repair-chain` | C | QA report + repair/decimate/UV/bake as lineage edges | a pipeline |
| `TASK-texture-pbr-tier` | C | Material Anything default; CHORD research-only flag | a pipeline |
| `TASK-rig-attach-tier` | C | UniRig rig attach; glTF skins/animations preserved | texture tier |
| `TASK-render-judge-loop` | C | Tiered judge + bounded adjust/re-run loop | a pipeline |
| `TASK-open-in-editor-handoff` | D | Export-to-working-dir + open-in-editor + re-ingest acceptance | bridge watch tier |
| `TASK-3d-i18n-and-a11y-pass` | D | i18n + a11y for viewer and run surfaces | viewer |

## Open questions

- **External-binary provisioning:** bundle (prebuilt, pinned) vs probe
  (user-installed) for COLMAP/gsplat/Blender — follow
  `epic-external-tooling-build.md`'s build-only, provenance-reported
  stance; decide at design time per binary.
- **Job-system pattern:** one DB-backed job-records pattern must win
  across builder run-jobs, emotion-avatar jobs, and reconstruction runs —
  this epic inherits the decision flagged in the workflow family.
- **SPZ vs PLY as storage:** SPZ chosen for storage (compact, versioned),
  PLY accepted as input and interchange.

## Related

- [`TASK-3d-generation.md`](../tickets/TASK-3d-generation.md) — umbrella (superseded-in-scope, kept)
- [`TASK-3d-asset-type-and-serving.md`](../tickets/TASK-3d-asset-type-and-serving.md)
- [`TASK-3d-frontend-viewer-lazy-mount.md`](../tickets/TASK-3d-frontend-viewer-lazy-mount.md)
- [`TASK-reconstruction-run-jobs.md`](../tickets/TASK-reconstruction-run-jobs.md)
- [`TASK-trellis2-view-set-pipeline.md`](../tickets/TASK-trellis2-view-set-pipeline.md)
- [`TASK-hunyuan-optional-fenced-tier.md`](../tickets/TASK-hunyuan-optional-fenced-tier.md)
- [`TASK-photogrammetry-external-tier.md`](../tickets/TASK-photogrammetry-external-tier.md)
- [`TASK-mesh-qa-and-repair-chain.md`](../tickets/TASK-mesh-qa-and-repair-chain.md)
- [`TASK-texture-pbr-tier.md`](../tickets/TASK-texture-pbr-tier.md)
- [`TASK-rig-attach-tier.md`](../tickets/TASK-rig-attach-tier.md)
- [`TASK-render-judge-loop.md`](../tickets/TASK-render-judge-loop.md)
- [`TASK-open-in-editor-handoff.md`](../tickets/TASK-open-in-editor-handoff.md)
- [`TASK-3d-i18n-and-a11y-pass.md`](../tickets/TASK-3d-i18n-and-a11y-pass.md)
- [`epic-view-set-generation.md`](./epic-view-set-generation.md) — input producer
- [`epic-asset-generation-metadata.md`](./epic-asset-generation-metadata.md) — facts spine
- [`epic-scene-environment-world-generation.md`](./epic-scene-environment-world-generation.md) — scene consumer
- [`epic-game-asset-pipeline-export.md`](./epic-game-asset-pipeline-export.md) — export consumer
