# BUG: BUG: message-seen POST races on deterministic primary key (500 on concurrency)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/message-seen.ts POST handler (lines ~160-195) does a select-then-insert using a deterministic id ms-<messageId>-<actorId>. Two concurrent POSTs for the same (message, actor) both observe no existing row, then both attempt INSERT with the same primary key, so the second throws a duplicate-PK error (HTTP 500). Fix: use INSERT with ON CONFLICT DO NOTHING / DO UPDATE on a unique (message_id, actor_id) constraint (add that constraint in migration 070), or generate a unique row id.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
