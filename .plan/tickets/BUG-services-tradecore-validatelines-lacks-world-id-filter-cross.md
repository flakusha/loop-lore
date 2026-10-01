<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: services: tradeCore validateLines lacks world_id filter (cross-world item IDOR)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-rpg-content-systems.md
**Tags:** rpg-content-systems

## Summary

src/services/trade/core.ts validateLines (lines 44-56) queries world_items by id only, with no .where("world_id","=",worldId). An item id from world A passed as a trade line in world B passes validation (item exists, owned by stated actor) but the subsequent transfer silently fails with a misleading error. Fix: add .where("world_id","=",worldId) to the validateLines query.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

trade/core.ts validateLines: world_items query now scoped by world_id — an item id from world A cannot validate in world B. (resolved 2026-09-06)
