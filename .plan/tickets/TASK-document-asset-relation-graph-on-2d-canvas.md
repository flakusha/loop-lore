<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Document/asset relation graph on 2D canvas

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

<!-- SPDX-License-Identifier: Apache-2.0 --><!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors --><a name="summary"></a>## SummaryRender document/asset relations as a node/edge graph on the shared graph-canvas: assets as nodes, asset_links rows as edges. Read-only v1.<a name="context"></a>## ContextDepends on FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas. Sources: assets table + asset_links (asset_id, entity_type, entity_id) joining to chats/stories/memories. Sibling: TASK-graph-view-of-plan-links-to-chats-stories-rag-items-assets (SVG/DOM, plan-scoped) -- this ticket is the canvas/asset-scoped counterpart and should converge on one renderer long-term. RAG entity graph (TASK-rag-knowledge-graph) feeds additional edges when it lands.<a name="acceptance"></a>## Acceptance Criteria- [ ] GET endpoint returns asset nodes + asset_links edges scoped by entity, capped at 200 nodes with paging.- [ ] Graph-canvas renders asset nodes by kind, click shows preview/metadata link.- [ ] bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
