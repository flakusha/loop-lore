<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: triggerAutoGeneration fire-and-forget unhandled rejection (reply.ts:40-42)

**Status:** ✅ Resolved (verified 2026-09-07; bookkeeping)
**Priority:** low
**Priority Tier:** P6+
**Effort:** Trivial
**Area:** chat
**Source:** reconcile review (Scout Batch A — ISSUE-4)

## Evidence

`src/routes/messages/reply.ts:40-42` fires `void triggerAutoGeneration(...)` with no `.catch`, no `await`, no logging.

## Impact

Promise rejection emits unhandled-rejection warning at runtime; failure mode invisible to client.

## Fix

Either `await` it (if latency is acceptable) or:

```
void triggerAutoGeneration(...).catch((err) => {
  log().error("triggerAutoGeneration failed", { err, chatId });
});
```

## Verification

- Unit test: inject throwing `triggerAutoGeneration` → assert no unhandled rejection, error logged.
- Optional: configure process to fail on unhandled rejection in test mode.

## Acceptance Criteria

- [ ] No bare `void asyncFn()` without `.catch`
- [ ] Errors logged with at least `chatId`

## Resolution

Verified on dev HEAD (2026-09-07). src/routes/messages/reply.ts wraps the fire-and-forget `void triggerAutoGeneration(...)` with a `.catch((error) => log().error(`triggerAutoGeneration failed: ${String(error)}`, undefined, { chatId }))` handler. No bare `void asyncFn()` remains.
