<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Quota UI & Admin Override

**Status:** ⬜ Open
**Priority:** medium
**Effort:** medium
**Epic:** epic-resource-provision
**Issue:** TBD
**Related:**
- `TASK-resource-provision-quota-engine`
- `TASK-resource-provision-routing-facade`

## Summary

Expose a real-time quota gauge, exhaustion notifications, and
admin override capability (for community hosts) in the
resource provision settings panel.

## Context

Quota enforcement lives in the backend (`TASK-resource-provision-quota-engine`),
but users and admins need visibility and control. The gauge
shows current consumption against ceilings; notifications fire
on approach and exhaustion; admins can override ceilings for
community-hosted instances.

## Acceptance Criteria

- [ ] Quota gauge per resource: requests/min, tokens/min,
  storage bytes, compute-hours, concurrency
- [ ] Gauge color-coded: green (< 70%), yellow (70–90%),
  red (> 90%)
- [ ] Notification when any counter crosses 90% of ceiling
  (toast + settings badge)
- [ ] Notification on quota exhaustion: `QuotaExceededError`
  surfaced as a user-facing message with fallback option
- [ ] Fallback option: "Switch to platform default" link on
  exhaustion notification
- [ ] Admin override panel: raise/lower ceilings per resource
  (community hosts only)
- [ ] Admin override requires elevated auth (not available
  to regular users)
- [ ] Override history: log of ceiling changes with timestamps
- [ ] All UI components in `src/frontend/settings/resource-provision.ts`
- [ ] Unit tests: gauge computation, notification triggers,
  admin override auth gate
- [ ] `bun run check` green
