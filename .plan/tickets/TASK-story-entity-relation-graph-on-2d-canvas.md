<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Story/entity relation graph on 2D canvas

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:** Render story relations as a node/edge graph on the shared graph-canvas for a world or chat: actors as nodes, `character_relationships` as edges. Read-only v1.

**Context:** Depends on FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas.

Sources: `character_relationships` (`actor_id`, `target_actor_id`, `relationship_type`, `standing`, `trust`, `familiarity`), `story_turns`, `actors`. Edge weight comes from standing/trust.

Distinguished from TASK-relationship-map-visual-graph (Done, mock-only — superseded as real backend data lands) and epic-relationships.md (romance/bond mechanics, not visualization).

**Acceptance Criteria:**

- [ ] GET endpoint returns actor nodes and `character_relationships` edges scoped by `world_id`, capped at 200 nodes with paging.
- [ ] Graph-canvas renders edges color/width-coded by `relationship_type` and standing; clicking an edge shows its detail.
- [ ] `bun run check` green.
