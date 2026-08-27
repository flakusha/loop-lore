# BUG: services: tradeCore validateLines lacks world_id filter (cross-world item IDOR)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/services/trade/core.ts validateLines (lines 44-56) queries world_items by id only, with no .where("world_id","=",worldId). An item id from world A passed as a trade line in world B passes validation (item exists, owned by stated actor) but the subsequent transfer silently fails with a misleading error. Fix: add .where("world_id","=",worldId) to the validateLines query.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
