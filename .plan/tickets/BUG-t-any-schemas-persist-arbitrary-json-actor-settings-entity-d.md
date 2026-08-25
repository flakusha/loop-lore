# BUG: t.Any() schemas persist arbitrary JSON: actor settings + entity data

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/validation/schemas/actors.ts:44 — ActorUpdateBody.settings t.Optional(t.Any()) → unvalidated JSON persisted to actors.settings. src/validation/schemas/entities.ts:19,28 — EntityCreate/UpdateBody.data t.Any() → arbitrary payload into entity data (memories/lore/notes). Fix: constrain to t.Object with known keys/depth/size bounds.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
