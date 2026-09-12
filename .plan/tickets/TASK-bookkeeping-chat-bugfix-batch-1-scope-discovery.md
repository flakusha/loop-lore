<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# TASK: chat-bugfix-batch-1 scope discovery (2 of 3 stale)

**Status:** Not Started
**Priority:** Low
**Effort:** Trivial

While preparing `chat-bugfix-batch-1`, the 3 proposed tickets were audited against the current `dev` state. Findings:

1. `BUG-chat-seen-currentActorId-never-assigned-markseen-sends-null` — **already fixed** in commit `89cc294a0 fix(security): derive seen-state actor from session, close client-trust inversion`. `src/routes/message-seen.ts` POST handler derives actor via `resolvePrimaryActorId(database, userId,)` (line 118), and `src/frontend/alpine/chat-seen.ts` `:52-58` no longer sends `actorId`. The BUG ticket is **stale** — needs status flip + a `## Resolution` block. The ticket file's `Status: ⬜ Not Started` is wrong; the work is done.

2. `TASK-group-chat-mention-routing` + `BUG-group-chat-mention-prefix-collision` — **already fixed** in commit `f1f92684` (per BUG ticket's `## Resolution` block). The companion TASK ticket still reads `Status: ⬜ Not Started`, but `src/group-chat/mention-parser.ts:78-104` already implements exact-match-first + prefix-collision-returns-null, and `src/group-chat/mention-parser.test.ts` covers all 5 collision cases. Both tickets are **stale**.

3. `TASK-deletechat-runs-9-sequential-deletes-without-transaction-orp` — **real work**. `src/chat/service/crud/delete.ts` had no transaction wrapper. Implemented in this worktree.

## Acceptance Criteria

- [ ] `BUG-chat-seen-currentActorId-never-assigned-markseen-sends-null.md` updated to `Status: ✅ Resolved` with `## Resolution` block citing commit `89cc294a0`
- [ ] `TASK-group-chat-mention-routing.md` updated to `Status: ✅ Already Implemented` (point to BUG ticket resolution + commit)
- [ ] `plan:sync:fix` regenerates `.plan/tickets/index.json` with the new statuses
- [ ] `bun run plan-ticket-index` / `plan-epic-coverage` / `plan-backlog-index` gates stay green
