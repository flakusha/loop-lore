<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Test harness close() cannot await the store flush it starts

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-testing-qa.md
**Tags:** testing

## Summary

The e2e harness's `close()` is synchronous (its JSD documents `server.close()`, and ~50 call sites in `tests/e2e/flows/*.test.ts` call it without await), so the store flush added to it is fire-and-forget.

`tests/e2e/helpers/server.ts` calls `void flushActiveStore()` inside a sync `close()`. Nothing can await it, so the queue is still draining when the caller's `afterAll` returns and the process moves to the next file. That is the same stranding the fix was meant to remove, one layer up: the browser harness awaits its flush because its `cleanup()` is async, but the non-browser harness cannot.

Evidence: the browser harness path is verified 30 -> 0 swallowed `async-store write failed` writes; the non-browser path has no equivalent verification because the API shape cannot express it.

**Acceptance Criteria:**
- [ ] `close()` either awaits the flush or is made async and every call site awaits it.
- [ ] A test proves a write enqueued before `close()` is persisted, so the gap fails loudly.
- [ ] The browser and non-browser harnesses quiesce the store by the same mechanism, not by accident.
- [ ] Implementation complete.
- [ ] Tests passing.
- [ ] Documentation updated.

**Impact:** cosmetic-to-mild in practice, but it means the two harnesses diverge on a property the fix was supposed to establish uniformly. A test asserting on async-store persistence right after `close()` can race. Filed separately from the spill-sweeper defect, which is a different root cause entirely.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Verification Notes (2026-10-01)

Re-verified against current `dev`; the defect this ticket describes is
already fixed. The ticket was left open past the fix.

Evidence: `tests/e2e/helpers/server.ts:418-426`

- `close` is now `async` and awaits `flushActiveStore()` after stopping the server and before clearing globals, so the queue cannot outlive the call.
