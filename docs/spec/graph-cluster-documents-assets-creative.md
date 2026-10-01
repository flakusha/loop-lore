<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Graph Cluster: Documents / Assets / Creative Process

> Substrate: FEAT-generic-2d-graph-canvas-renderer
> (`graph-canvas/{types,draw,index}.ts`: nodes `id/label/kind/color`,
> edges `from/to/label`, static layout, no force-physics v1).
> Precedent: `game-canvas` (`draw.ts` + `index.ts`) is import-one-direction-only.

## 1. Edge model

`asset_links` row = edge. PK `pk_asset_links` on
`asset_id/entity_type/entity_id`; columns `label` (free-form, nullable),
`sort_order` (generated int).

`AssetLinkEntity` (`src/db/enums-content.ts`): `Chat|Character|World|Actor|`
`Location|Quest|Item|Memory|Message|Asset` (values lowercase; `Asset` = self-link).

Key APIs: `linkAsset` / `getAssetLinks` (`src/assets/service/links.ts`).
Re-link same pair = no-op; FK violations propagate.

## 2. Batch-generation linkage

Two label conventions turn links into group/chain edges:

- **Emotion variants:** `generation.ts` persists each avatar asset with
  `link: { entityType: Actor, entityId: actorId, label: "emotion:<name>" }`.
  Same actor + distinct `emotion:X` labels = variant group node set.
- **Matting derivatives:** `MATTING_SOURCE_LABEL = "matting-source"`
  (`src/generation/matting/service.ts`); derivative → source via
  `link: { entityType: Asset, entityId: sourceId, label: MATTING_SOURCE_LABEL }`.
  Chains: derivative of derivative follows same label.

Lifecycle split: in-memory job store drives live `runBatchGeneration`
(`emotion-avatar-service/generation.ts`: batch loop, failure isolation,
cancel) while DB lifecycle records (`getGenerationJobRecord`) persist
terminal status. Graph reads DB records only, never live job objects.
`persistGeneratedImages` (`src/assets/service/persist-generated.ts`) is the
shared generation→asset contract: buffers become asset rows + one link each,
sequential writes, duplicates flagged not skipped.

## 3. Node/edge mapping

- **Document bindings:** entity nodes (Chat/Character/World/Memory/Message)
  link outward to asset nodes; edge label = `asset_links.label` or entity type.
- **Harness code-change nodes:** asset of kind `code-change` (harness output
  persisted as asset) links to owning entity; label = change summary.
- **Gallery batch groups:** assets sharing one `persistGeneratedImages` call
  (same Actor link + `emotion:X` labels) collapse to one group node; expand on click.
- **Creative stage tracking:** matting chain (`matting-source` Asset→Asset
  edges) renders as linear pipeline: raw → matted → approved.

Kind→color follows `game-canvas` `KIND_COLORS` pattern (per-kind hex map,
`#9ca3af` fallback).

## 4. Implementation phases

1. **GET endpoint** (`/api/assets/graph?entityType=&entityId=`): asset nodes +
   `asset_links` edges scoped by entity, 200-node cap with cursor paging.
   RAG entity edges feed in once TASK-rag-knowledge-graph lands.
2. **Canvas render:** map rows to graph-canvas nodes/edges; static layout;
   asset nodes colored by kind; group nodes for batch sets.
3. **Click preview:** node click → preview/metadata panel (thumbnail, label,
   owning entity link, matting-source chain position). Read-only v1.

## 5. Bindings

- Epics: `epic-asset-platform-capabilities`, `epic-rag-document-processing`,
  `epic-creative-studio`.
- Tasks: `TASK-document-asset-relation-graph-on-2d-canvas`
  (canvas/asset-scoped; sibling plan-scoped SVG/DOM view converges long-term),
  `TASK-rag-knowledge-graph` (entity extraction feeds edges post-landing).
