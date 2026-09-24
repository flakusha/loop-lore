<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# PERF: dispatchCommand runs 3 sequential DB queries (command.ts:47-60)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved (already on dev, 2026-09-18)
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

- [x] Three queries issued in parallel
- [x] No regression in message dispatch

## Resolution (2026-09-18)

**Status at scan**: Ticket stale w.r.t. HEAD. `src/routes/messages/command.ts:79-99` already wraps the three queries in `Promise.allSettled`, with an explanatory comment block (lines 74-78) naming the prior 3-sequential-await pattern. The comment also explains why `allSettled` was used instead of `Promise.all` (project `no-restricted-syntax` rule).

Note that `Promise.allSettled` was chosen over the ticket's suggested `Promise.all`. Per-ticket acceptance "three queries issued in parallel" still holds — the wrapper shape differs by ESLint policy.

**Verification**: `bun test src/assistant/commands/workflow-dispatch.test.ts src/assistant/commands/battle.integration.test.ts` → 18 pass / 0 fail. Dispatch path regression-free.


git issue: d9c73e5
