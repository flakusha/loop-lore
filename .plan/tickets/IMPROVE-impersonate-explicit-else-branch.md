<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IMPROVE: updateImpersonation missing explicit else branch for clarity

**Status:** Open
**Priority:** low
**Priority Tier:** P6+
**Effort:** Trivial
**Area:** impersonation
**Source:** reconcile review (Scout Batch C — IMP-4)

## Evidence

`src/chat/service/participants.ts:25-65` — `updateImpersonation` has no explicit `else` block for the `if (chat?.world_id)` conflict branch. Logic is functionally correct but readability is poor.

## Impact

Low — logic is correct but the missing `else` makes the flow harder to verify.

## Fix

Add explicit `else` comment block:

```ts
if (conflict) {
  return { code: "CONFLICT", message: "Another user is impersonating in this chat" };
} else {
  // no conflict — proceed with update
}
```

## Verification

- Re-run existing `participants.test.ts` impersonation tests.

## Acceptance Criteria

- [ ] Logic unchanged
- [ ] No new test required (clarity-only change)
