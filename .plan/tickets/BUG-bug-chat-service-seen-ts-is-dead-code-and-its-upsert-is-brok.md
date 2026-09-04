# BUG: BUG: chat/service/seen.ts is dead code and its upsert is broken

**Status:** ✅ Resolved (already on dev, 2026-09-04)
**Priority:** low
**Effort:** Medium

## Summary

src/chat/service/seen.ts getMessageSeen/recordMessageSeen/deleteMessageSeen are exported (and re-exported in service/index.ts) but have zero callers; src/routes/message-seen.ts reimplements the ledger inline. Additionally recordMessageSeen uses onConflict(columns: [message_id, actor_id]).doUpdateSet, but migration 070 has NO unique constraint on (message_id, actor_id) (only a PK on id and non-unique indexes), so the upsert would throw if the service were ever wired. Fix: either delete the dead service or fix it (add the unique constraint + correct upsert) and have the route use it.

## Resolution

Already fixed in dev: the unique index on `message_seen(message_id, actor_id)` was added by `540c2233` (feat(db): migration 072), so the `recordMessageSeen` upsert's `onConflict(columns: [message_id, actor_id])` now resolves correctly. The dead-service ambiguity was resolved by `841ba137` (fix: split message-seen helpers, trim blog JSDoc, resolve lint/format/md issues) — the service is now wired/consistent rather than dead. Verified 2026-09-04 against current `dev` (`7c76aed4`).

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
