<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: proactive quiet-hours off-by-one at boundaries (timing.ts:14-16)

**Status:** Open
**Priority:** medium
**Priority Tier:** P3
**Effort:** Trivial
**Area:** chat (proactive)
**Source:** reconcile review (Scout Batch A — ISSUE-6)

## Evidence

`src/chat/proactive/timing.ts:14-16` — overnight quiet-hours check:

```
if (startMinutes > endMinutes) {
  return startH <= currentH && (currentH < endH || currentH >= startH);
}
```

## Impact

- 22:00–07:00 window: `currentH < 7` excludes hour 7 (which should be in quiet hours ending at 07:00). 7:00 AM is excluded from quiet hours → an unwanted proactive message could fire at 07:00:00.
- `currentH >= startH` excludes hour 22 (22:00 should be in quiet hours starting at 22:00). 22:00:00 is excluded → proactive fires at 22:00:00.

## Fix

Use minute precision with inclusive `>=` on start and exclusive `<` on end (or interval algebra). Express with `currentMinutes` and reuse the same `startMinutes`/`endMinutes` comparisons; drop the hour-shortcut.

## Verification

- Unit tests:
  - `isInQuietHours(22:00, 22:00, 07:00)` → true
  - `isInQuietHours(22:00, 22:00, 07:00)` at 07:00 → false (exclusive end)
  - `isInQuietHours(22:00, 22:00, 07:00)` at 23:30 → true
  - `isInQuietHours(09:00, 09:00, 17:00)` at 17:00 → false (exclusive end)
  - `isInQuietHours(09:00, 09:00, 17:00)` at 09:00 → true (inclusive start)

## Acceptance Criteria

- [ ] All boundary tests pass
- [ ] Asserts on minute precision, not hour shortcut
