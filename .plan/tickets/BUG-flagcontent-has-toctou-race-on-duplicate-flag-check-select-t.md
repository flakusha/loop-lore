<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: flagContent has TOCTOU race on duplicate flag check - SELECT then INSERT allows concurrent duplicates

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Summary:** src/nsfw/moderation-service/flags.ts:41 checks for an existing flag with a SELECT then inserts if missing. Two concurrent requests with the same (reporter_id, content_type, content_id) can both pass the SELECT before either INSERT, creating a duplicate row.

**Where:** src/nsfw/moderation-service/flags.ts:41

**Defect:** 
```
const existing = await db.selectFrom(...).where(reporter_id, content_type, content_id).executeTakeFirst();
if (existing) return existing;
await db.insertInto("flags",).values(...).execute();
```
No unique constraint on (reporter_id, content_type, content_id, chat_id). The pre-check is racy; under concurrent load duplicates land.

**Fix sketch:** Add a UNIQUE INDEX on (reporter_id, content_type, content_id, chat_id) via migration. Replace pre-check + insert with INSERT ... ON CONFLICT DO NOTHING RETURNING * (or handle the constraint violation gracefully).

**Acceptance:** Concurrent test: two flagContent calls with same args fired in parallel — current code inserts both; fixed code inserts one and returns the existing on the second.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
