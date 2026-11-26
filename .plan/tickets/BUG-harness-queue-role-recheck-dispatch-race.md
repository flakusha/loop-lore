<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: harness queue role recheck dispatch race

**Status:** Done
**Priority:** high
**Effort:** Small
**Epic:** epic-harness-integration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** Move the live role resolution inside the shared admission gate (`assertHarnessExecution`) so role check and dispatch cannot straddle a demotion.

**Context:** `.tmp/intercom/FIXED-security-fix-wave-2026-11-21.md:31` records a live role re-check, but the check and dispatch remain separable; a demotion inside that window still runs at the old role. Keep the queued `requested_role` for audit. Do not refile the stale `BUG-harness-queue-replays-stale-role-snapshot-bypasses-demotion` draft; its premise no longer holds.

**Acceptance Criteria:**

- [x] Admission gate resolves role immediately before dispatch; no earlier verdict is consumed.
- [x] A demotion between enqueue and admission cannot execute at the old role.
- [x] Queued `requested_role` remains in the audit record.
