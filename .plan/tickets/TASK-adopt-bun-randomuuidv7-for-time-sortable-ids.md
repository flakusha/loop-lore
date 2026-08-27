# TASK: Adopt Bun.randomUUIDv7() for time-sortable IDs

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Replace crypto.randomUUID() with Bun.randomUUIDv7() for database IDs and request IDs. Improves B-tree index locality, enables time-based sorting, reduces index fragmentation.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
