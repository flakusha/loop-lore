<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: triggerAutoGeneration fire-and-forget unhandled rejection (reply.ts:40-42)

**Status:** Open
**Priority:** low
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
