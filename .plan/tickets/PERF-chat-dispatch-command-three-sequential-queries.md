<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# PERF: dispatchCommand runs 3 sequential DB queries (command.ts:47-60)

**Status:** Open
**Priority:** low
**Priority Tier:** P6+
**Effort:** Trivial
**Area:** chat
**Source:** reconcile review (Scout Batch A — ISSUE-5)

## Evidence

`src/routes/messages/command.ts:47-60` — `dispatchCommand` runs:

```
const chatRecord = await db.selectFrom("chats").where("id","=",chatId).executeTakeFirst();
const recentMessages = await db.selectFrom("messages").where("chat_id","=",chatId).orderBy("created_at","desc").limit(50).execute();
const participant = await db.selectFrom("participants").where("chat_id","=",chatId).andWhere("user_id","=",userId).executeTakeFirst();
```

Three sequential awaits per `/command` invocation.

## Impact

Latency overhead on every slash-command; trivially parallelizable.

## Fix

Wrap in `Promise.all([...])`.

## Verification

- Unit test with query spy: assert ≤3 calls but dispatched in parallel (timing-based or spy order).
- Re-run existing slash-command tests.

## Acceptance Criteria

- [ ] Three queries issued in parallel
- [ ] No regression in message dispatch
