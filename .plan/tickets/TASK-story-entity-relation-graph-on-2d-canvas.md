<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Story/entity relation graph on 2D canvas

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

<!-- SPDX-License-Identifier: Apache-2.0 --><!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors --><a name="summary"></a>## SummaryRender story relations as a node/edge graph on the shared graph-canvas: story_turns / story participants / character_relationships edges for a world or chat. Read-only v1.<a name="context"></a>## ContextDepends on FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas. Sources: character_relationships (actor_id, target_actor_id, relationship_type, standing, trust, familiarity), story_turns, actors. Distinguished from TASK-relationship-map-visual-graph (Done, mock-only, superseded as backend lands) and epic-relationships.md (romance/bond mechanics, not visualization). Nodes = actors/characters, edges = character_relationships rows with standing/trust weight.<a name="acceptance"></a>## Acceptance Criteria- [ ] GET endpoint returns actor nodes + character_relationships edges scoped by world_id, capped at 200 nodes with paging.- [ ] Graph-canvas renders edges color/width-coded by relationship_type and standing, click shows detail.- [ ] bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
