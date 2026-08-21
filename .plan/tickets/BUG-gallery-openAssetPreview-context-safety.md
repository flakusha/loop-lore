<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: gallery grid onclick openAssetPreview ReferenceError when gallery not top-level

**Status:** Open
**Priority:** medium
**Priority Tier:** P3
**Effort:** Small
**Area:** gallery
**Source:** reconcile review (Scout Batch C — GAL-3)

## Evidence

`src/routes/views/gallery.ts:137` — `onclick="openAssetPreview('${a.id}')"` uses a global `openAssetPreview` defined in `src/frontend/pages/gallery.ts:70`. If the gallery view is rendered in an embedded context (chat panel, world detail) where `gallery.ts` hasn't been loaded, the onclick throws `ReferenceError`.

## Impact

Gallery grid embedded outside the `/gallery` page context causes `ReferenceError` on click; feature unusable in embedded contexts.

## Fix

Register `openAssetPreview` as a permanent global at app init (e.g., in `src/frontend/main.ts` or similar) instead of inside the `/gallery` page module. Or use Alpine's `x-on:click` directive to bind the handler as a component method.

## Verification

- Embed gallery grid in chat panel context → click asset → no ReferenceError.
- Assert `globalThis.openAssetPreview` is defined before any gallery renders.

## Acceptance Criteria

- [ ] Gallery works when embedded (not on /gallery page)
- [ ] `openAssetPreview` available as global
