<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: harness-queue-boot-recovery-fails-other-instances-inflight-turns

**Status:** Done
**Status Note (2026-11-18):** Summary defect addressed: `recoverInterruptedTurns` in `src/integrations/harness/queue-store.ts` scopes boot recovery with `WHERE status = 'running' AND owner_slug = <booting instanceSlug>`, so a second instance no longer fails the first instance's in-flight turns; `owner_slug` is written at claim time and added by migration `105_harness_queue_owner` (nullable, pre-105 rows left alone). This ticket does not demand `setEffectiveServerBind` identity threading — identity here is the resolved instance slug passed as `instanceSlug` — so no remainder.
**Priority:** high
**Effort:** Medium
**Epic:** epic-harness-integration.md
**Tags:** harness, queue, boot, recovery, multi-instance, data-loss

**Summary:**

At boot, the harness queue fails every row whose status is running, because the queue has no owner discriminator: it cannot tell "a turn this process lost" from "a turn another instance is running right now". Booting a second instance therefore kills the first instance's in-flight turns and reports that the process died.

**Depends on:** BUG-harness-queue-claim-ignores-affected-rows-double-executes-tu (W2-1, H1 — filed this wave as issue df0d0cc) — the owner column is written at claim time, so the cross-process claim must land first.

Explicitly NOT building:

- A heartbeat/lease protocol for in-flight turns.
- Automatic re-queueing of a failed turn with a retry policy.
- A distributed scheduler.

**Caveats:** schema migration, liveness detection, orphaned turns

**Context:**

- src/integrations/harness/queue-store.ts:182-198 performs the boot recovery; src/db/schema-core.ts:2246-2264 is the queue table definition. There is no column identifying which instance owns a running turn.
- Report 03 §(c) H16: on a shared database, booting instance B fails instance A's in-flight turns. The operator sees "the process died" for a turn that is still running elsewhere, and the work is lost or double-charged.
- The fix direction is the same one the whole harness-multi-instance axis needs: an instance discriminator on queue rows. The instance identity source already exists after the XDG landing (resolveInstanceSlug in packages/core/src/config/state-dir.ts), so the new column can be populated from it without a new identity system.

Minimal fix (report 03 §(c) H16): add an owner column (the instance slug) to the queue table, write it when a turn is claimed, and scope boot recovery to rows owned by this instance. Rows owned by another live instance are left alone; rows owned by this instance are failed as before. A schema migration is required.

**Acceptance Criteria:**

- [ ] The queue table carries an instance/owner discriminator, populated at claim time from the resolved instance slug.
- [ ] Boot recovery fails only rows owned by the booting instance.
- [ ] Booting a second instance does not fail or re-queue the first instance's in-flight turn (covered by a test with two instances against one queue).
- [ ] The schema migration is applied by the normal migration path and is safe to run against an existing queue table.
- [ ] A turn owned by this instance and left running by a crash is still failed at the next boot of that same instance.
- [ ] Tests passing, documentation updated.
