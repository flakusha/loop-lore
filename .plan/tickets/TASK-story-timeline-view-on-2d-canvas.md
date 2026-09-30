<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Story timeline view on 2D canvas

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

<!-- SPDX-License-Identifier: Apache-2.0 --><!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors --><a name="summary"></a>## SummaryRender world_timeline_events as a chronological lane layout on the shared graph-canvas: events as time-ordered nodes, causal/story links as edges, timeline_id branches as parallel lanes. Read-only v1.<a name="context"></a>## ContextDepends on FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas. Sources: world_timeline_events (world_id, story_id, event_type, actor_id, occurred_at, timeline_id default prime) + world_timelines, read via listTimelineEntries in src/story/timeline/world-timeline.ts. Related: epic-timeline-system.md (branching timelines backend), docs/research/memory-isolation-and-world-timeline.md. Layout differs from force/radial graphs: x = occurred_at order, y = timeline_id lane; renderer must support a timeline layout mode.<a name="acceptance"></a>## Acceptance Criteria- [ ] GET endpoint returns timeline events ordered by occurred_at with lane = timeline_id, capped at 200 nodes with paging.- [ ] Graph-canvas timeline mode renders lanes + event nodes color-coded by event_type, click shows description.- [ ] bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
