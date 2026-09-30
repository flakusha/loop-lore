<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Document/asset relation graph on 2D canvas

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** Render document/asset relations as a node/edge graph on the shared graph-canvas: assets as nodes, `asset_links` rows as edges. Read-only v1.

**Context:** Depends on FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas.

Sources: `assets` plus `asset_links` (`asset_id`, `entity_type`, `entity_id`, PK `pk_asset_links`) joining out to chats, stories, and memories.

Sibling: TASK-graph-view-of-plan-links-to-chats-stories-rag-items-assets is the SVG/DOM, plan-scoped counterpart; this ticket is the canvas/asset-scoped one, and the two should converge on a single renderer long-term. RAG entity edges (TASK-rag-knowledge-graph) feed in once it lands.

**Acceptance Criteria:**

- [ ] GET endpoint returns asset nodes and `asset_links` edges scoped by entity, capped at 200 nodes with paging.
- [ ] Graph-canvas renders asset nodes by kind; clicking a node shows a preview/metadata link.
- [ ] `bun run check` green.
