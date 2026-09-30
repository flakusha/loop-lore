<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Story timeline view on 2D canvas

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:** Render `world_timeline_events` as a chronological lane layout on the shared graph-canvas: events as time-ordered nodes, `timeline_id` branches as parallel lanes. Read-only v1.

**Context:** Depends on FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas.

Sources: `world_timeline_events` (`world_id`, `story_id`, `event_type`, `actor_id`, `occurred_at`, `timeline_id` default `prime`) plus `world_timelines`; read via `listTimelineEntries` in `src/story/timeline/world-timeline.ts`.

Related: epic-timeline-system.md owns branching-timeline backend work; docs/research/memory-isolation-and-world-timeline.md covers memory isolation semantics.

Layout differs from radial/force graphs — x = `occurred_at` order, y = `timeline_id` lane — so the renderer must support a timeline layout mode alongside the default one.

**Acceptance Criteria:**

- [ ] GET endpoint returns timeline events ordered by `occurred_at` with lane = `timeline_id`, capped at 200 nodes with paging.
- [ ] Graph-canvas timeline mode renders lanes plus event nodes color-coded by `event_type`; clicking an event shows its description.
- [ ] `bun run check` green.
