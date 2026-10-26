<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TUI: silent `catch {}` in chat-create-api.ts

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** low
**Effort:** trivial
**Epic:** epic-terminal-ui

## Summary

`src/tui/chat-create-api.ts` has two `catch {}` blocks that swallow errors without logging:

**Line 67-68** — reading the error body after a non-ok response:

```ts
try {
  text = await response.text();
} catch {
  return { ok: false, error: `HTTP ${response.status}`, };
}
```

**Line 80** — reading the success body:

```ts
try {
  text = await response.text();
} catch {
  return { ok: false, error: "Create succeeded but response body unreadable", };
}
```

Both catches are intentional fallbacks: they return a Result with a descriptive error message rather than propagating the exception. The error is surfaced to the caller via the `Result` union. This is **deliberate fallback behavior**, not a silent swallow — the caller receives `{ ok: false, error: ... }` and can display the failure.

## Analysis

These catches ARE fine:
- They are not silent — they return a meaningful error in the Result union
- The caller (`chat-picker.ts`) handles the `ChatCreateResult` and shows the error via `showError` or equivalent
- `response.text()` throwing here means the body is unreadable (network-level issue), which is genuinely not recoverable; returning a descriptive error is the right fallback

## Recommendation

**Close this ticket as not a bug.** The catches are a deliberate fallback pattern (Result-returning instead of throwing), consistent with the module's documented contract ("@throws never — all errors are captured in the result union").

If the concern is cosmetic (the empty catch block looks like a silent swallow), add a comment: `// body unreadable — fall through to error result`.

## Acceptance Criteria

- [ ] Audited; confirmed catches are deliberate Result-returning fallbacks, not silent swallows
- [ ] Optional: add clarifying comment to catch blocks


git issue: 0dbdc9f
