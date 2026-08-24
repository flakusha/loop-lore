# BUG: Crafting station instances scoped across worlds — cross-world read/write

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/routes/crafting/station-instances.ts:132 — updateInstance/getInstance fetch by bare instanceId after world-owner check on a different path param; instance from another world readable/mutable. Fix: scope query by worldId.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
