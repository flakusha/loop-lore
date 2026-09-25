<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: 2D world review: proximity query for nearby actors into group chat

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Radius/zone proximity lookup for nearby actors + group chats.
**Context:** FEAT click-to-move; joinable filters exact location only.
**Acceptance Criteria:** Nearby actors listed with one-tap join.

## Summary

FEAT-2d-world-click-to-move acceptance requires proximity opening group chat with co-travelers. Joinable routes (src/routes/chat-search/joinable.ts) already filter by exact `world` + `location` (`chats.current_location_id`) — verified. The gap is finer-grained proximity: actors in zone/radius via map_zones + actor_snapshots/actor_locations (exact-location match is insufficient once sprites move continuously within/between zones). Add radius/zone proximity lookup returning nearby actors + their group chats for one-tap join. Small slice; reuses fractal coords (coord_x/y/z verified in 001_init).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
