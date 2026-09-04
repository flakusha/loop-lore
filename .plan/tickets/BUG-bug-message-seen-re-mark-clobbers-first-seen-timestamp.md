# BUG: BUG: message-seen re-mark clobbers first-seen timestamp

**Status:** ✅ Done
**Priority:** medium
**Effort:** Low

## Summary

In `src/routes/message-seen.ts`, re-marking a message (POST with same `ms-<msgId>-<actorId>` key) updated `state` but overwrote `first_seen_at` with the current time. The original first-seen timestamp should be preserved — only `last_seen_at` and `state` should change on a re-mark. Fix: in the ON CONFLICT path, `first_seen_at = excluded.first_seen_at` is incorrect (re-stamps) — instead preserve the existing value by NOT including `first_seen_at` in `doUpdateSet`, or by `first_seen_at = message_seen.first_seen_at`.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Fixed in commit `70176a12` (`fix(message-seen): enforce state enum, atomic upsert, IDOR-safe POST + DELETE`). The atomic upsert now preserves `first_seen_at` on re-mark; only `last_seen_at` and `state` change. Index marked done; this file was out of sync.
