# BUG: BUG: message-seen POST races on deterministic primary key (500 on concurrency)

**Status:** ✅ Resolved (already on dev, 2026-09-04)
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/message-seen.ts POST handler (lines ~160-195) does a select-then-insert using a deterministic id ms-<messageId>-<actorId>. Two concurrent POSTs for the same (message, actor) both observe no existing row, then both attempt INSERT with the same primary key, so the second throws a duplicate-PK error (HTTP 500). Fix: use INSERT with ON CONFLICT DO NOTHING / DO UPDATE on a unique (message_id, actor_id) constraint (add that constraint in migration 070), or generate a unique row id.

## Resolution

Already fixed in dev by `70176a12` (fix(message-seen): enforce state enum, atomic upsert, IDOR-safe POST + DELETE) plus the unique index added in `540c2233` (feat(db): migration 072 - unique index on message_seen(message_id, actor_id)). Verified 2026-09-04 against current `dev` (`7c76aed4`):

- `src/routes/message-seen.ts` — POST now uses `.onConflict((oc) => oc.columns(["message_id","actor_id"]).doUpdateSet(...))` atomic upsert, so concurrent POSTs for the same (message, actor) no longer race on the primary key.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
