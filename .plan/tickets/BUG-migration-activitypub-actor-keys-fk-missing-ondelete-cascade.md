# BUG: migration: activitypub_actor_keys FK missing onDelete cascade

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/db/migrations/069_activitypub_actor_keys_and_federation_consent.ts line 33 addForeignKeyConstraint lacks onDelete("cascade"). Every other FK in the codebase uses onDelete("cascade"); deleting an actor that has federation signing keys will fail with a FK constraint violation. Fix: add onDelete("cascade") to the constraint.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
