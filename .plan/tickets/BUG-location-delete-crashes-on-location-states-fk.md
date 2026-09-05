<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: location DELETE crashes on location_states FK

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

src/routes/worlds/locations.ts:271-291 nulls chats.current_location_id + deletes row but never deletes location_states; FK no CASCADE (migration parts/003_worlds.ts:16) -> 500 on any initialized location; world delete does the cleanup (worlds.ts:179-180). Fix: delete location_states first (or cascade).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
