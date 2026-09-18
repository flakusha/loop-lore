<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: tui/asset-view.ts: remove silent catch + void-without-catch pattern in setChatId

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** low
**Effort:** trivial

## Summary

`src/tui/asset-view.ts:177-183` contains:

```ts
void (async () => {
  try {
    await this.loadAssets();
  } catch {
    /* non-critical */
  }
})();
```

This trips two banned patterns in `.agents/references/banned-patterns.md`:
- "Fire-and-forget `void` without `.catch()`" — the outer `void` swallows rejection.
- "Silent catch blocks" — `catch { /* ignore */ }` swallows all error info.

In practice the outer catch is unreachable: `loadAssets()` already catches internally and surfaces via `renderInfo()`. So this is defensive code for a case that can't happen. The patterns themselves are still banned; the fix is to remove the belt-and-suspenders layer.

## Acceptance Criteria

- [ ] `setChatId` invokes `loadAssets()` directly without the wrapping `void (async () => {...})()` IIFE. Either: (a) make `loadAssets` synchronous in its outer signature and surface errors through `renderInfo`, OR (b) keep `loadAssets` async and call it without wrapping — let it propagate up to the caller (but the caller can't await it because `setChatId` is sync).
- [ ] If pattern (b) is chosen, document the choice with a short comment; pattern (a) is preferred.
- [ ] Lint clean (no banned patterns).
- [ ] No behavior regression: when `loadAssets` errors, the user still sees the error in the asset panel via `renderInfo`.

## Notes

- Deferred from `tui-updates` worktree (2026-09-14 review pass): lives in untestable `asset-view.ts`.
- Pure code-shape cleanup; no functional change in the default path.