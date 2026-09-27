<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: 2D world review: world-scoped snapshot and event SSE feed

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Summary:** World-scoped snapshots endpoint + WorldEventType SSE feed.
**Context:** epic-2d-sprite-world; activity-stream is per-user, no world scope.
**Acceptance Criteria:** GET snapshots + events/stream per world.

## Summary

Epic epic-2d-sprite-world needs SSE/poll serving actor snapshots + WorldEventType feed per world. Existing GET /api/activity/stream (src/routes/activity-stream.ts) is per-user unseen-counts with no world scope; TASK-world-event-system (epic-world-locations) covers timeline/dynamics, not the wire feed. Add GET /api/worlds/:id/snapshots (event-driven actor_snapshots) + GET /api/worlds/:id/events/stream (WorldEventType feed), reusing ActivityStreamer change-detection pattern. Blocks FEAT-2d-world-view-only-canvas-map liveness and click-to-move reconcile.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
