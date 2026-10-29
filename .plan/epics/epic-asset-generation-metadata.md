<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Asset Generation Metadata (Self-Describing Generations)

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Filed 2026-10-28 (plan branch `plan-creative-3d`). Base scope promoted from the Image-MetaHub review drafts (concepts adopted, no code); the four view-set/3D extension tasks came from the creative-3D research package.
**Priority:** Medium-High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** assets, comfyui, metadata, provenance, views, 3d, gallery

## Overview

Generated assets should be self-describing: workflow facts (prompt, model,
LoRAs, sampler, seed, dimensions) plus the overrides loop-lore applied are
captured at generation time and stored on/with the asset; imported assets
get the same facts recovered from file metadata by a tiered parser
(embedded sidecar chunk → graph traversal → regex), each result stamped
with how it was obtained. Users can correct metadata via non-destructive
shadow overrides (original preserved, revertible) — the same philosophy as
`asset_transforms` (`epic-asset-transform-metadata.md`, sibling).

Today `src/assets/metadata.ts` extracts only dimensions/type/alpha at
upload and is immutable. Gallery/search/lineage/LoRA workflows all need
generation facts; recovering them later is far more fragile than capturing
them at queue time.

This epic is the **metadata spine** for the creative-3D cluster:
`epic-view-set-generation.md`, `epic-3d-generation.md`, and
`epic-scene-environment-world-generation.md` all consume the captured
facts, so it files first.

## Design anchors

- **Capture-at-write beats parse-at-read** (Save-Node concept): the ComfyUI
  provider already knows `prompt_id`, workflow, substitution vars, and
  applied overrides — persist a WorkflowFacts-style struct on job
  completion (`provider-submitted` provenance). The queue-time capture seam
  is owned by `epic-comfyui-first-class-citizen.md`.
- **Parse-imported fallback tiers** with `_detection_method` stamping; the
  regex tier reuses `src/regex/` and `src/assets/png-text-chunk.ts`
  (decodes tEXt/zTXt today; iTXt support is a design note for the parser
  task — ComfyUI/save-node chunks use tEXt/zTXt but iTXt appears in some
  exports).
- **Dimensions come from the actual file, never the workflow**
  (upscale/crop invariant).
- Camera/view-set facts, 3D run facts, **and video/audio run facts** ride
  the same capture struct (see extension tasks below) with an explicit
  camera-convention flag — the COLMAP/nerfstudio hybrid (OpenCV|OpenGL),
  seeds stored as strings so values above 2^53 survive round-trips
  exactly. Video facts add mode, duration, fps, and the
  `timeline_data`/`builder_state` JSON (amended 2026-10-28, plan-ivss:
  the capture-at-queue-time seam is unchanged; the >2^53 seed rule
  applies to all video workflows).

## Relations (existing epics)

| Epic | Relation |
| ---- | -------- |
| `epic-asset-transform-metadata.md` | Sibling — shadow-metadata philosophy shared; no scope overlap |
| `epic-comfyui-first-class-citizen.md` | Owns the queue-time capture seam the fact-capture task rides |
| `epic-asset-platform-capabilities.md` | Renditions/B4 captions consume the same metadata row |
| `epic-import-export-io.md` | Chunk read/write precedent (PNG steganography) |
| `epic-view-set-generation.md` | Primary consumer — camera facts, set membership |
| `epic-3d-generation.md` | Consumer — 3D run facts, embedded manifests on glTF outputs |
| `epic-scene-environment-world-generation.md` | Consumer — projection metadata (equirect flag) |
| `epic-frontend-gallery.md` | Facet filters over generation facts (readiness here) |
| `epic-multimodal-asset-reuse.md` | generation-context API emits the captured facts |

## Tickets (this epic)

| Ticket | Scope | Depends on |
| ------ | ----- | ---------- |
| `TASK-generation-fact-capture-at-queue-time` | WorkflowFacts capture at job completion (base scope) | — |
| `TASK-asset-metadata-shadow-overrides` | Non-destructive user corrections, revertible (base scope) | fact capture |
| `TASK-imported-generation-metadata-parser` | Tiered parser for imported assets (base scope) | — |
| `TASK-metadata-detection-provenance-stamping` | `_detection_method` stamping on parse results (base scope) | parser |
| `TASK-view-set-camera-metadata-fields` | Camera/view-set facts in the capture struct + schema | fact capture |
| `TASK-3d-generation-fact-capture` | 3D run facts recorded by the E2 pipeline | fact capture, `TASK-reconstruction-run-jobs` |
| `TASK-embedded-regeneration-manifest` | PNG tEXt + glTF extras write-back with read-side parser | fact capture |
| `TASK-external-manifest-interop` | Read A1111/Civitai-style metadata from imports | parser |

## Open questions

- **Visual similarity is out of scope here** — the third Image-MetaHub
  draft (asset-visual-similarity, CLIP-style "find similar") stays unfiled
  pending `epic-rag-vector-store` infrastructure; generate-or-reuse gates
  in downstream epics fall back to tag overlap until it lands.
- **Facet UI** belongs to the gallery epics; this epic only guarantees the
  fact rows exist.

## Non-goals

- Visual similarity / embeddings (gated draft, own epic when filed).
- Lineage links (`epic-asset-lineage-provenance.md`).
- Facet filter UI (gallery epics).
- Any downstream auto-regeneration from stale facts.

## Related

- [`TASK-generation-fact-capture-at-queue-time.md`](../tickets/TASK-generation-fact-capture-at-queue-time.md)
- [`TASK-asset-metadata-shadow-overrides.md`](../tickets/TASK-asset-metadata-shadow-overrides.md)
- [`TASK-imported-generation-metadata-parser.md`](../tickets/TASK-imported-generation-metadata-parser.md)
- [`TASK-metadata-detection-provenance-stamping.md`](../tickets/TASK-metadata-detection-provenance-stamping.md)
- [`TASK-view-set-camera-metadata-fields.md`](../tickets/TASK-view-set-camera-metadata-fields.md)
- [`TASK-3d-generation-fact-capture.md`](../tickets/TASK-3d-generation-fact-capture.md)
- [`TASK-embedded-regeneration-manifest.md`](../tickets/TASK-embedded-regeneration-manifest.md)
- [`TASK-external-manifest-interop.md`](../tickets/TASK-external-manifest-interop.md)
- [`epic-asset-transform-metadata.md`](./epic-asset-transform-metadata.md) — sibling
- [`epic-asset-lineage-provenance.md`](./epic-asset-lineage-provenance.md) — lineage consumer
- [`epic-view-set-generation.md`](./epic-view-set-generation.md) — consumer
- [`epic-3d-generation.md`](./epic-3d-generation.md) — consumer

git issue: 24401c5
