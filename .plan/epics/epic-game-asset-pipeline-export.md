<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Game Asset Pipeline & Engine Export

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Filed 2026-10-28 (plan branch `plan-creative-3d`) from the creative-3D research package. Last in the creative-3D sequence (after view sets, 3D, and scenes).
**Priority:** Low-Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** export, godot, bevy, gltf, engine, interactive, embeddable, manifest, packaging

## Overview

The engine-facing epics that exist are transport-shaped (Unity/Godot
REST+WS SDKs; the embeddable backend StoryEvent stream — per epic files).
Nothing owns the **asset side**: exporting loop-lore's generated/managed
content (characters, props, environments, scenes, view-set-derived
models, splats) as engine-consumable packages — glTF/GLB + PBR +
animations, SPZ splats, scene manifests — nor the engine-specific
import/validation steps (Godot headless import + post-import scripts;
Bevy asset processing constraints) nor a versioned "interactive project"
binding that keeps exports in sync with asset lineage.

## Goals

1. **Export bundles**: deterministic, versioned export of an asset set
   (model + textures + rig/animations + splat + scene manifest +
   regeneration manifests embedded) as a zip via the existing bulk-export
   machinery (`epic-import-export-io.md` precedent; SSE export stream).
2. **Godot target tier**: project scaffolding + `godot --headless
   --import` verification step + `EditorScenePostImport` post-import
   script template + `--export-pack` packaging recipe; documented per
   Godot 4.x (MIT, output-ownership confirmed).
3. **Bevy target tier**: export profile honoring bevy_gltf's extension
   gaps (no Draco/meshopt/KHR_animation_pointer/KHR_gaussian_splatting;
   KTX2/WebP format caveats) — uncompressed glTF profile + AssetProcessor
   consumption docs.
4. **Interactive project binding**: an "interactive project" record
   binding a world/chat + asset set + export profile + export history
   (lineage-linked), so re-exports are reproducible (pinned assets +
   manifests).
5. **Embeddable-web consumption**: the export profile that serves the
   in-app surfaces (model-viewer/3D viewer + canvas) is the same packaging
   the embeddable game frontend consumes — one manifest, three targets
   (web/Godot/Bevy).

## Non-goals

- Engine SDK clients, WS/transport, StoryEvent semantics (owned by
  `epic-game-engine-sdks.md` / `epic-embeddable-backend.md`).
- Authoring games in engines; runtime engine features; multiplayer.
- A second scene-manifest schema — `epic-scene-environment-world-generation.md`'s
  manifest is the scene source of truth; this epic defines only the
  export projection.

## Data/model sketch

- `engine_exports` table: `id`, `owner_id`, `project_scope` (world_id/
  chat_id/asset ids), `profile` (godot | bevy | web_embed), `manifest_ref`,
  `artifact_asset_id` (the zip/bundle as an asset), `pinned_assets` JSON,
  status machine, audit columns; lineage to included assets.

## Relations (existing epics)

| Epic | Relation |
| ---- | -------- |
| `epic-asset-generation-metadata.md` | Regeneration manifests embedded in bundles |
| `epic-asset-lineage-provenance.md` | Pinned asset sets lineage-linked; reproducibility |
| `epic-3d-generation.md` | 3D assets/viewer precede export; web-embed profile rides viewer work |
| `epic-scene-environment-world-generation.md` | Scene manifests are the scene source of truth; export projects them |
| `epic-import-export-io.md` | Bundle/export-stream precedent; IO epic stays the format-normalizer home |
| `epic-game-engine-sdks.md` | Transport peer — SDK clients are out of scope here |
| `epic-embeddable-engine-game-frontend.md` | Web-embed consumer |
| `epic-embeddable-backend.md` | StoryEvent runtime seam (transport peer) |
| `epic-game-frontend-scenes.md` | Web consumer of the export profile |
| `epic-frontend-gallery.md` | Export entry points from gallery surfaces |

## Tickets (this epic)

| Ticket | Scope | Depends on |
| ------ | ----- | ---------- |
| `TASK-engine-export-bundles` | Deterministic bundle builder with lineage pointers + NSFW consent | E0a embedded manifests |
| `TASK-godot-headless-import-verification` | Godot 4.x scaffolding + headless import verification + post-import template | bundles |
| `TASK-bevy-export-profile` | Bevy-safe glTF profile (extension allowlist as hard gate) + docs | bundles |
| `TASK-interactive-project-binding` | Project record + export history + reproducibility | bundles, lineage |
| `TASK-web-embed-profile` | Web-embed projection (viewer-compatible, lazy) | bundles, 3D viewer |

## Open questions

- **Pin vs advance on re-export:** user choice recorded per re-export
  (settled in the interactive-project ticket's design).
- **Splat transport:** Bevy has no gaussian-splatting extension — splats
  ride the web profile and Godot pack (as files), not the Bevy profile.

## Related

- [`TASK-engine-export-bundles.md`](../tickets/TASK-engine-export-bundles.md)
- [`TASK-godot-headless-import-verification.md`](../tickets/TASK-godot-headless-import-verification.md)
- [`TASK-bevy-export-profile.md`](../tickets/TASK-bevy-export-profile.md)
- [`TASK-interactive-project-binding.md`](../tickets/TASK-interactive-project-binding.md)
- [`TASK-web-embed-profile.md`](../tickets/TASK-web-embed-profile.md)
- [`epic-scene-environment-world-generation.md`](./epic-scene-environment-world-generation.md) — manifest source
- [`epic-3d-generation.md`](./epic-3d-generation.md) — asset producer
- [`epic-import-export-io.md`](./epic-import-export-io.md) — IO precedent

git issue: afc219c
