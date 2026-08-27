# BUG: BUG: chat/service/seen.ts is dead code and its upsert is broken

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/chat/service/seen.ts getMessageSeen/recordMessageSeen/deleteMessageSeen are exported (and re-exported in service/index.ts) but have zero callers; src/routes/message-seen.ts reimplements the ledger inline. Additionally recordMessageSeen uses onConflict(columns: [message_id, actor_id]).doUpdateSet, but migration 070 has NO unique constraint on (message_id, actor_id) (only a PK on id and non-unique indexes), so the upsert would throw if the service were ever wired. Fix: either delete the dead service or fix it (add the unique constraint + correct upsert) and have the route use it.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
