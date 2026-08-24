# BUG: Group participant injection absent on manual generate route

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

groupParticipantsSection only enabled via params.groupParticipantIds, set only in prepare-generation. build-prompt.ts / context-budget.ts omit it. Also includes user participants. Wire groupParticipantIds on manual route; exclude actor_type=user.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
