<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: chat batch export N+1 (batch.ts:72-98)

**Status:** Open
**Priority:** medium
**Priority Tier:** P3
**Effort:** Small
**Area:** chat
**Source:** reconcile review (Scout Batch A — ISSUE-1)

## Evidence

`src/chat/service/batch.ts:72-98` — `batchExportChats` loops over owned chats and runs three queries per chat:

```
for (const chat of owned) {
  const messages = await db.selectFrom("messages").where("chat_id", "=", chat.id).execute();
  const participants = await db.selectFrom("participants").where("chat_id", "=", chat.id).execute();
  ...
}
```

## Impact

N+1: 1 query for `owned` + N queries for messages + N queries for participants. For a user with 100 chats, 201 round-trips.

## Fix

Pre-fetch messages and participants in two batch queries:

```
const allMessages = await db.selectFrom("messages")
  .where("chat_id", "in", ownedIds).execute();
const allParticipants = await db.selectFrom("participants")
  .where("chat_id", "in", ownedIds).execute();
```

Then partition in-memory by `chat_id` and iterate.

## Verification

- Existing unit test `src/chat/service/batch.test.ts` covers `batchExportChats` happy path — re-run after fix.
- Add DB-query spy/count assertion to enforce the new behavior (≤3 queries total).

## Acceptance Criteria

- [ ] `batchExportChats` issues ≤3 DB queries regardless of chat count
- [ ] Test asserts query count
- [ ] `bun run check` clean
