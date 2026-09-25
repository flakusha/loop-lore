<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: 2D world review: proximity query for nearby actors into group chat

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

FEAT-2d-world-click-to-move acceptance requires proximity opening group chat with co-travelers, but no nearby-actor query exists: joinable routes (src/routes/chat-search/joinable.ts) list joinable chats with no spatial filter. Add proximity lookup (actors in zone/radius via map_zones + actor_snapshots/actor_locations) returning nearby actors + their group chats for one-tap join. Small slice; reuses fractal coords (coord_x/y/z verified in migration 001).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
