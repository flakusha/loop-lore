<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TEST: gallery frontend chat-utils has zero unit tests

**Status:** Open
**Priority:** low
**Effort:** Medium
**Area:** gallery
**Source:** reconcile review (Scout Batch C — GAL-4)

## Evidence

`src/frontend/alpine/chat-utils/gallery.ts` — `loadGalleryAssets`, `uploadChatAssets`, `loadCharacterInfo`, `getMediaStyle`, `openMediaPreview` are all untested.

## Impact

No automated coverage for gallery frontend logic; regressions in asset loading, media style computation, or preview open are undetected.

## Fix

Add `src/frontend/alpine/chat-utils/gallery.test.ts` using Vitest with mocked Alpine/HMX globals:

```ts
// Mock Alpine and HTMX globals
globalThis.Alpine = { store: () => ({ data: {} }) };

it("loadGalleryAssets returns asset array", async () => { ... });
it("getMediaStyle returns correct CSS object", async () => { ... });
```

## Verification

- Run `bun test src/frontend/alpine/chat-utils/gallery.test.ts`

## Acceptance Criteria

- [ ] All exported functions have at least one test
- [ ] Mock Alpine/HMX globals correctly
