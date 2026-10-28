<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Scene & Environment Generation for Automated World Building

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Filed 2026-10-28 (plan branch `plan-creative-3d`) from the creative-3D research package (scope expansion A).
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** environments, scene, world, skybox, hdri, terrain, textures, layout, parallax, assets, reuse, propagation

## Overview

Worlds/locations exist as data + lore + a 2D game-state canvas
(`src/components/chat/game-canvas.html`), and image generation exists per
asset — but nothing turns a **world/location description into a coherent
environment kit**: no background/prop asset generation, no skybox/HDRI, no
terrain/heightmap, no tileable texture sets, no depth→parallax scene
layers, and no **scene layout** step that places generated *or reused*
assets into a location scene (for VN backgrounds, the 2D canvas, or the 3D
viewer). Generated avatars/items are not reusable as scene conditioning
beyond the per-message avatar path, and regeneration does not propagate
into scenes that consumed an asset.

## Goals

1. **Environment kit generation** per location/world (all ComfyUI-first
   where possible, sdcpp-compatible tiers flagged where not):
   - backgrounds/establishing shots + prop assets (existing engines; prompt
     packs seeded from location description + lore with memory-budget-style
     assembly, `src/memory/budget.ts` pattern);
   - panorama→skybox (DiT360-class equirect workflows; TiledDiffusion tier
     carries the CC BY-NC-SA fence) + HDRI/env-map from scene images
     (DiffusionLight/HDRflow research tiers, clearly flagged);
   - terrain/heightmap tier (external Hesiod/Infinigen CLIs + the derived
     map epic's depth maps as a no-new-binary fallback; ML terrain research
     explicitly out);
   - tileable/seamless texture sets (ComfyUI seamless-tiling nodes +
     Materialize-CLI photo→PBR; Material Maker CLI as bridged tool).
2. **Scene layout manifest**: LLM (assistant/aux-pipeline) emits a
   structured placement manifest (scene graph: assets + transforms +
   layers + parallax factors + lighting notes) from the world/location
   context, grounded in existing rows (`worlds`, `locations`,
   `world_lore_entries`, `location_edges`); validated against asset
   availability; rendered by three consumers: VN scene backgrounds (2.5D
   parallax), the 2D game canvas, and the 3D viewer (later 3D scene).
3. **Asset reuse + propagation**: avatar/item/location art reused as
   conditioning (reference lanes per the reference-conditioned model);
   propagation policy from E0b (regenerated source → stale consumers);
   dedup/content-hash identity already exists; a similarity gate joins
   only when the gated visual-similarity epic files (tag overlap until
   then).
4. **World generation pipeline**: world/location description → asset
   manifest (props/ground/sky/lighting) → generate-or-reuse decision (dedup
   plus similarity gate) → kit assets + scene manifest → display/export.
   Assistant-driven as a workflow template; deterministic parts as
   services.

## Non-goals

- Owning weather/terrain *data* (stays in `epic-weather-environment.md` —
  this epic consumes `WeatherState`/`Terrain` as prompt inputs).
- Owning world rows/2D canvas/licensing (stays in
  `epic-worlds-extension.md`); sprite/variant generation for the 2D world
  (stays in `epic-2d-sprite-world.md`); VN rendering itself
  (`epic-visual-novel-mode.md`).
- 3D reconstruction of environments (`epic-3d-generation.md` provides the
  machinery; this epic only feeds view sets/captures).
- General mesh/scene editing UIs (SuperSplat-class editing → future).

## Data/model sketch

- `scene_layouts` table: `id`, `owner_id`, `world_id`/`location_id`
  anchor, `kind` (vn_background | canvas_2d | model3d_scene), `manifest`
  JSON (versioned schema: entries[{asset_id | kit_ref, layer, transform,
  parallax, z}], lighting/sky refs), `status`, audit columns; assets
  referenced via existing link entities + lineage.
- `environment_kits` concept as a view over kit assets linked to a
  location (sky, ground, props, textures) — link-label vocabulary rather
  than a new binary table (finalize at design).
- Generation runs reuse the E2 job-records pattern (pipeline
  discriminator).

## Surface sketch

- World/location detail: "Environment" tab (kit assets, generate buttons
  per tier, layout preview).
- VN background surface: parallax layers from manifest (extends the VN
  scene template engine, `src/frontend/vn/templates/`); 2D canvas:
  manifest-driven prop placement; 3D viewer consumer arrives with the E2
  Phase B+ viewer.

## Relations (existing epics)

| Epic | Relation |
| ---- | -------- |
| `epic-asset-generation-metadata.md` | Projection metadata (equirect flag) in generation facts |
| `epic-asset-lineage-provenance.md` | Stale-consumer propagation for scene layouts |
| `epic-view-set-generation.md` | View sets for objects placed in scenes |
| `epic-3d-generation.md` | 3D viewer + reconstruction for scene display |
| `epic-worlds-extension.md` | Boundary: this epic writes placement manifests referencing `worlds.id`/`locations.id`; worlds-extension renders/anchors world rows and the 2D canvas |
| `epic-world-locations.md` | Anchor rows |
| `epic-weather-environment.md` | `WeatherState`/`Terrain` data as prompt inputs (no fork) |
| `epic-fractal-locations.md` | Location coordinates for placement |
| `epic-2d-sprite-world.md` | Scene assembly feeds the 2D canvas; sprite generation stays there |
| `epic-visual-novel-mode.md` | VN surfaces consume scene generation (backgrounds, staging) |
| `epic-derived-map-generation.md` | Depth/PBR/masks are input derivatives |
| `epic-reference-conditioned-generation.md` | Reference lanes for reused assets |
| `epic-reactive-actor-appearance.md` | Multi-actor scene prompts |
| `epic-asset-platform-capabilities.md` | Kit asset storage/dedup |
| `epic-image-prompt-templating.md` | Environment prompt packs |
| `epic-external-creative-tool-bridge.md` | Bridged CLIs (Hesiod/Infinigen/Material Maker) |
| `epic-entity-generation-workflows.md` | Entity workflow pattern |
| `epic-workflow-engine.md` | `world-environment` dispatch backend |

## Tickets (this epic)

| Ticket | Scope | Depends on |
| ------ | ----- | ---------- |
| `TASK-scene-layout-manifest-schema` | Versioned manifest schema + validation + revision safety | — |
| `TASK-scene-layout-llm-step` | Grounded manifest draft from world/location context | schema |
| `TASK-environment-kit-background-and-props-tier` | Background/prop generation + generate-or-reuse gate | schema |
| `TASK-environment-kit-skybox-hdri-tier` | Panorama→skybox + env-map research tier (fenced) | schema, E0a facts |
| `TASK-environment-kit-terrain-tier` | Heightmap tier: derived-map fallback + external CLIs | schema |
| `TASK-environment-kit-tileable-texture-tier` | Seamless textures + photo→PBR with seam check | schema |
| `TASK-scene-parallax-vn-and-canvas-consumers` | VN parallax + 2D canvas prop placement from one manifest | manifest, LLM step |
| `TASK-scene-reuse-propagation` | Stale markers + refresh-scene-from-updated-assets | propagation policy, manifest |
| `TASK-environment-kit-assistant-workflow` | `world-environment` workflow template | workflows EXT, manifest |

## Open questions

- **Similarity gating:** the generate-or-reuse gate uses content hash +
  tag overlap in v1; a CLIP-style similarity gate joins when the gated
  visual-similarity epic (Image-MetaHub draft, unfiled) lands.
- **Kit vocabulary:** link-label scheme vs dedicated table — finalize at
  design (sketched as a view over links).
- **Schema authority:** the scene manifest schema here is the single
  source; `epic-game-asset-pipeline-export.md` defines only the export
  projection of it.

## Related

- [`TASK-scene-layout-manifest-schema.md`](../tickets/TASK-scene-layout-manifest-schema.md)
- [`TASK-scene-layout-llm-step.md`](../tickets/TASK-scene-layout-llm-step.md)
- [`TASK-environment-kit-background-and-props-tier.md`](../tickets/TASK-environment-kit-background-and-props-tier.md)
- [`TASK-environment-kit-skybox-hdri-tier.md`](../tickets/TASK-environment-kit-skybox-hdri-tier.md)
- [`TASK-environment-kit-terrain-tier.md`](../tickets/TASK-environment-kit-terrain-tier.md)
- [`TASK-environment-kit-tileable-texture-tier.md`](../tickets/TASK-environment-kit-tileable-texture-tier.md)
- [`TASK-scene-parallax-vn-and-canvas-consumers.md`](../tickets/TASK-scene-parallax-vn-and-canvas-consumers.md)
- [`TASK-scene-reuse-propagation.md`](../tickets/TASK-scene-reuse-propagation.md)
- [`TASK-environment-kit-assistant-workflow.md`](../tickets/TASK-environment-kit-assistant-workflow.md)
- [`epic-asset-generation-metadata.md`](./epic-asset-generation-metadata.md) — facts spine
- [`epic-3d-generation.md`](./epic-3d-generation.md) — display machinery
- [`epic-workflow-engine.md`](./epic-workflow-engine.md) — dispatch backend

git issue: cd9e3c5
