<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## TASK: Cron admin observability + docs

**Status:** ✅ Done
**Priority:** Medium
**Effort:** Small
**Epic:** epic-cron-scheduler
**Related:** TASK-cron-registry-core

## Summary

Expose scheduler status (job list, last/next run, last error) plus manual
trigger, and document the job catalog + how to add a job.

## Context

Timers today are invisible: no way to confirm the retention cleanup or
offload scan ever ran. Registry `getStatus()` already tracks this; surface it
through the existing admin API conventions (follow `src/admin/` patterns,
admin-gated like other admin routes).

## Acceptance Criteria

- [ ] Admin-gated endpoints: list jobs with status; `POST` trigger single job
  (`runOnce`) — validation via `src/validation/` TypeBox schemas
- [ ] Admin UI section only if it fits existing templates cheaply; otherwise
  API + docs suffice (note the call in the ticket on implementation)
- [ ] `docs/` scheduler section: job catalog table, adding-a-job recipe,
  cron expression cheat sheet, config reference
- [ ] `bun run check` green
