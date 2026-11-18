<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: harness-queue-per-profile-serialization-is-process-local-not-global

**Status:** Done
**Status Note (2026-11-18):** Summary defect addressed: the per-profile exclusion is now DB-side — `claimNextQueuedTurn` in `src/integrations/harness/queue-store.ts` folds the "no other running turn for this profile" check (`NOT EXISTS` on `running` rows for the candidate profile) into the same single claim `UPDATE` statement, backed by the `(profile, status)` index from migration `105_harness_queue_owner`, so two instances sharing one database cannot drive the same profile concurrently. This ticket does not demand `setEffectiveServerBind` identity threading — so no remainder.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-integration.md
**Tags:** harness, queue, concurrency, profile, multi-instance

**Summary:**

The queue's "one turn in flight per profile" rule is enforced by a process-local Map. Two app instances sharing one database both believe they hold the profile, so both drive the same ACP profile concurrently — which the profile's own worktree and session model cannot support.

**Depends on:** BUG-harness-queue-claim-ignores-affected-rows-double-executes-tu (W2-1, H1 — issue df0d0cc) and BUG-harness-queue-boot-recovery-fails-other-instances-inflight-t (W2-2, H16 — issue 6887ad6) — the owner discriminator and the cross-process claim must land first; the three share one prerequisite.

Explicitly NOT building:

- A distributed lock service or a queue broker.
- Per-profile fairness or priority scheduling.
- A change to what a profile is.

**Caveats:** db-query latency, lock scope, profile identity across instances

**Context:**

- src/integrations/harness/queue.ts:169 and :192-195 maintain the in-flight profile set in process memory.
- Report 03 §(c) H17: with two instances against one database, both can pick a turn for the same profile. The serialized-profile guarantee the harness relies on is therefore only true within one process.
- This is one of the three defects that together make "two app instances on one machine" unsafe for the harness (with H1 duplicate claim and H16 boot recovery). The three share one prerequisite: the queue rows need an instance discriminator and the claim needs to be cross-process.

Minimal fix (report 03 §(c) H17): make the exclusion set a database query rather than a process-local map — before claiming a turn for a profile, check that no other row for that profile is currently in flight (an index on (profile, status) makes this a cheap lookup), and include the claiming instance in the same statement so the check-and-claim is one operation.

**Acceptance Criteria:**

- [ ] The per-profile in-flight exclusion is evaluated against the database, not a process-local map.
- [ ] Two instances against one queue never drive the same profile concurrently (covered by a two-connection test).
- [ ] The single-instance behaviour is unchanged.
- [ ] A query index for the profile/status lookup exists (or the existing schema already provides one).
- [ ] Tests passing, documentation updated.
