<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: tui/asset-view.ts: remove silent catch + void-without-catch pattern in setChatId

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** low
**Effort:** trivial
**Epic:** epic-terminal-ui

## Summary

`src/tui/asset-view.ts:200-205` now reads:

```ts
setChatId(chatId: string,): void {
  this.chatId = chatId;
  this.currentIndex = 0;
  // loadAssets surfaces failures via renderInfo and never rejects.
  void this.loadAssets();
}
```

The banned `void (async () => { try {...} catch {...} })()` IIFE is gone. `loadAssets` (`:220-254`) catches internally and calls `renderInfo` on failure, so the outer catch was unreachable dead weight.

## Acceptance Criteria

- [x] `setChatId` invokes `loadAssets()` directly without the wrapping `void (async () => {...})()` IIFE — done (pattern b: async call without wrapping, `loadAssets` handles errors internally)
- [x] Short comment documents the choice — `// loadAssets surfaces failures via renderInfo and never rejects.`
- [x] Lint clean (no banned patterns).
- [x] No behavior regression: when `loadAssets` errors, the user still sees the error in the asset panel via `renderInfo`.

## Resolution

Code evidence — `src/tui/asset-view.ts:200-205`:

```ts
setChatId(chatId: string,): void {
  this.chatId = chatId;
  this.currentIndex = 0;
  // loadAssets surfaces failures via renderInfo and never rejects.
  void this.loadAssets();
}
```

`loadAssets` at `:220-254` catches internally:

```ts
} catch (error) {
  this.assets = [];
  this.renderInfo(`Error: ${(error as Error).message}`,);
}
```

No `void (async () => { try {...} catch {...} })()` pattern remains in the file.

## Notes

- Deferred from `tui-updates` worktree (2026-09-14 review pass): lives in untestable `asset-view.ts`.
- Pure code-shape cleanup; no functional change in the default path.