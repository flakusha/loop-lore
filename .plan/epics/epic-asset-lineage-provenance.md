<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Asset Lineage Provenance (Generation Chains)

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Filed 2026-10-28 (plan branch `plan-creative-3d`). Promoted from the Image-MetaHub review drafts (concepts adopted, no code) plus one creative-3D extension task (`TASK-lineage-propagation-policy`).
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** assets, lineage, provenance, hash, gallery

## Overview

First-class transformation chains over assets: an img2img/inpaint/upscale/edit
output links back to its source asset(s), building a queryable lineage
graph. The existing `assets.content_hash` (unique, dedup-enforced since
migration 030, `hashBuffer` in create) serves as the identity anchor for
provenance rows; a provenance summary reports what evidence exists rather
than claiming certainty.

`asset_links` is polymorphic but semantically flat — "this asset was
derived from that scene image" is exactly the relationship RPG workflows
generate constantly (emotion avatars, scene edits, Director cuts), and
nothing today records it. The creative-3D cluster adds scene layouts, 3D
models, and engine exports as further consumers of the same chain.

## Design anchors

- Patched-payload `parent_image` embed → at generation time the queue
  knows the source asset(s); write the lineage row at completion.
- Link-kind vocabulary (source / derived / variant / edit) on new columns
  or a dedicated table — decision during design; `asset_links` stays
  polymorphic.
- Content-hash dedup already exists at ingest (migration 030); lineage
  rows reference it instead of re-hashing. Gallery duplicate-suggestions
  consume the same hash.
- Honest provenance UI: "source evidence available" ≠ proven fact.
- **Propagation policy (creative-3D extension):** when a source asset
  regenerates, downstream consumers (scenes, 3D models, engine exports)
  are marked stale via `GET /assets/:id/usage` backlinks — surfacing only,
  never silent mutation; auto-regeneration stays with the consumer epics'
  confirm-gated loops.

## Relations (existing epics)

| Epic | Relation |
| ---- | -------- |
| `epic-asset-generation-metadata.md` | Depends — generation facts are what lineage rows link; content-hash anchor shared |
| `epic-asset-platform-capabilities.md` | Backlinks/usage API surfaces view-set and scene consumers; content-hash dedup owner |
| `epic-view-set-generation.md` | Consumer — view sets link to source assets via lineage |
| `epic-3d-generation.md` | Consumer — post-processing steps recorded as lineage edges |
| `epic-scene-environment-world-generation.md` | Consumer — stale-consumer propagation for scene layouts |
| `epic-game-asset-pipeline-export.md` | Consumer — export bundles pin lineage-linked asset sets |
| `epic-frontend-gallery.md` | Lineage section / open-lineage entry from preview |
| `epic-emotion-avatar-message-binding.md` | Emotion-avatar chains are the canonical lineage workload |

## Tickets (this epic)

| Ticket | Scope | Depends on |
| ------ | ----- | ---------- |
| `TASK-asset-lineage-link-kinds` | Link-kind vocabulary (source/derived/variant/edit) | — |
| `TASK-lineage-content-hash-anchors` | Reuse `assets.content_hash` as identity anchor (migration 030) | — |
| `TASK-lineage-query-ui` | Queryable graph + per-asset lineage listing | link kinds, hash anchors |
| `TASK-provenance-summary` | Evidence-strength summary, honest wording | query UI |
| `TASK-lineage-propagation-policy` | Downstream-consumer backlinks + stale/refresh markers | query UI |

## Open questions

- **Link-kind storage:** columns on `asset_links` vs a dedicated lineage
  table — settled at design; `asset_links` remains the polymorphic base.
- **Cycle policy:** propagation marks are one hop per write (regeneration
  event → direct consumers); deep chains update lazily on read.

## Non-goals

- Auto-regeneration of consumers (each consumer epic owns its
  confirm-gated loop).
- Visual similarity / duplicate detection beyond content-hash suggestions
  (gated Image-MetaHub draft, unfiled).
- Second content hash — reuse the existing one, no new identity scheme.

## Related

- [`TASK-asset-lineage-link-kinds.md`](../tickets/TASK-asset-lineage-link-kinds.md)
- [`TASK-lineage-content-hash-anchors.md`](../tickets/TASK-lineage-content-hash-anchors.md)
- [`TASK-lineage-query-ui.md`](../tickets/TASK-lineage-query-ui.md)
- [`TASK-provenance-summary.md`](../tickets/TASK-provenance-summary.md)
- [`TASK-lineage-propagation-policy.md`](../tickets/TASK-lineage-propagation-policy.md)
- [`epic-asset-generation-metadata.md`](./epic-asset-generation-metadata.md) — facts spine
- [`epic-view-set-generation.md`](./epic-view-set-generation.md) — consumer
- [`epic-3d-generation.md`](./epic-3d-generation.md) — consumer
- [`epic-scene-environment-world-generation.md`](./epic-scene-environment-world-generation.md) — consumer

git issue: ec5aefd
