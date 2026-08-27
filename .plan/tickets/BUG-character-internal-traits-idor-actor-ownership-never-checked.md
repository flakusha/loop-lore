# BUG: Character internal traits IDOR — actor ownership never checked

**Status:** duplicate
**Priority:** high
**Effort:** Medium

## Summary

src/routes/character-internal-traits/index.ts:101 — DELETE/PUT use only requireUserId; actorId from query never ownership-checked (requireActorAccess not called). Any user can overwrite/delete any actor's traits. Fix: call requireActorAccess.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
