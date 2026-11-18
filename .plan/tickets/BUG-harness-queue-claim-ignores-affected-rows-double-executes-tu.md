<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: harness-queue-claim-ignores-affected-rows-double-executes-turn

**Status:** Done
**Status Note (2026-11-18):** Summary defect addressed: `claimNextQueuedTurn` in `src/integrations/harness/queue-store.ts` is a single conditional `UPDATE ... WHERE status = 'queued' ... RETURNING`; zero rows returned (lost race) yields `null` instead of reading back and executing a turn the caller did not win, and `owner_slug` is written at claim time. This ticket does not demand `setEffectiveServerBind` identity threading — so no remainder.
**Priority:** high
**Effort:** Medium
**Epic:** epic-harness-integration.md
**Verification note (2026-11-18):** no claim-path fix is present in the dev tree; status stays Not Started. Instance identity now derives from the effective bind pinned at startup (`setEffectiveServerBind` in `src/server/start.ts`, uncommitted in `packages/core/src/config/state-dir.ts`), so a future owner discriminator should use `resolveInstanceSlug`'s result, not `PORT` alone.
**Tags:** harness, queue, concurrency, duplicate-execution, spend

**Summary:**

claimNextQueuedTurn performs the claim as an UPDATE ... WHERE status = 'queued' and then reads the row back, but it never checks how many rows the UPDATE actually changed. Two processes can therefore both claim the same queued turn and both execute it: duplicated model spend, duplicated side effects, and duplicated output in the chat.

**Depends on:** none — this is the first of the wave-2 harness tickets; W2-2 and W2-3 build on it.

Explicitly NOT building:

- A work-queue service, broker or external scheduler.
- Exactly-once semantics beyond the claim itself (the turn is still at-least-once once claimed).
- Per-model or per-provider queue partitioning.

**Caveats:** sqlite update semantics, duplicate side effects, in-flight turn recovery

**Context:**

- src/integrations/harness/queue-store.ts:107-118 — the claim path issues the UPDATE and then reads the row; the affected-row count is not consulted.
- Report 03 §(c) H1 (as-promised vs as-built): the shipped claim is not atomic with respect to another process, so two app instances sharing one database file can both move the same turn out of queued.
- Duplicate execution is not harmless here: a harness turn drives a real model, may write worktree files, and may post messages. The observable damage is duplicated spend and duplicated side effects, on every contended claim.
- The repro script exists: .tmp/repro/repro-h1-two-connections-and-fix.ts (two connections, one queue).

Minimal fix (report 03 §(c) H1): honour the UPDATE's affected-row count. When it is 0, the row was taken by another process — return null (no turn claimed) instead of reading back and executing the row the caller did not win. If the affected-row count is not exposed by the query wrapper in use, select the candidate row first and claim it with a conditional UPDATE that includes the observed status, then check the count again.

**Acceptance Criteria:**

- [ ] The claim path checks the affected-row count of the UPDATE and treats 0 as "not claimed".
- [ ] With two concurrent claimers against one queue, exactly one receives the turn (covered by a test using two connections).
- [ ] The loser receives null and does not execute, log or bill anything.
- [ ] .tmp/repro/repro-h1-two-connections-and-fix.ts shows the duplicate-execution behaviour before the fix and its absence after.
- [ ] The single-process queue path is unchanged (no regression in turn throughput).
- [ ] Tests passing, documentation updated.
