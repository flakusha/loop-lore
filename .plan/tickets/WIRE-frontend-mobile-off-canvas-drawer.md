<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# WIRE: Frontend Mobile Off-Canvas Drawer — Opt-In Guard + Improvements

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 📝 Draft
**Priority:** High
**Effort:** Medium
**Epic:** `epic-frontend-keynav-mobile`
**Depends on:** —

## Summary

Add `uiStore.swipeGesturesEnabled` opt-in guard to the existing `src/frontend/alpine/sidebar.ts` swipe handlers, add a proper off-canvas drawer with focus trap for the `#layout-sidebar` element, and extend the existing `app.css` mobile breakpoints with `prefers-reduced-motion` guard.

## Current State

- `src/frontend/alpine/sidebar.ts` **already exists** with:
  - `swipeRightFromLeftEdge` — 60px threshold, 40px left-edge zone
  - Swipe-right toggles sidebar open; swipe-left closes it
  - Uses `uiStore.showChatList` state
- `src/frontend/alpine/sidebar.ts` has NO opt-in guard — gestures are always active.
- `src/frontend/stores/ui-store.ts` has no `swipeGesturesEnabled` field.
- `src/public/css/app.css:2337` — `@media (width <= 768px)` mobile breakpoint already exists.
- `src/public/css/app.css:24` — `100dvh` viewport fix pattern already in use.
- `src/frontend/alpine/focus.ts` has `trapFocus` available.

## Design

### ui-store extension

```ts
// src/frontend/stores/ui-store.ts
export const uiStoreDefinition: Record<string, unknown> = {
  // ... existing fields ...
  swipeGesturesEnabled: false,  // opt-in for sidebar swipe gestures
  drawerOpen: false,            // off-canvas drawer state
};
```

### sidebar.ts — add opt-in guard

```ts
// sidebar.ts — existing file, modify

// In swipe handler:
const SWIPE_LEFT_ZONE = 40;
const SWIPE_THRESHOLD = 60;

const onSwipeStart = (e: TouchEvent) => {
  if (!uiStore.swipeGesturesEnabled) return;  // ← ADD
  // ... existing start logic
};
```

### Off-canvas drawer CSS (extend app.css at mobile breakpoint)

```css
/* src/public/css/app.css — extend @media (width <= 768px) at :2337 */

@media (width <= 768px) {
  #layout-sidebar {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: min(80vw, 280px);
    z-index: 50;
    transform: translateX(-100%);
    transition: transform 200ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    #layout-sidebar { transition: none; }
  }
  #layout-sidebar.open {
    transform: translateX(0);
  }
  #sidebar-backdrop {
    display: block;
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 40;
  }
}
```

### Alpine component (extend existing sidebar.ts)

The existing `sidebar.ts` Alpine component already has `toggle()` and `close()`. Extend to support off-canvas:

```ts
// sidebar.ts — extend existing component
import { trapFocus } from "./focus";

export function sidebar() {
  return {
    open: false,
    cleanupTrap: null as (() => void) | null,

    toggle() {
      this.open = !this.open;
      document.body.style.overflow = this.open ? "hidden" : "";
      if (this.open) {
        const el = document.querySelector("#layout-sidebar");
        if (el) this.cleanupTrap = trapFocus(el);
        this.$nextTick(() => el?.focus());
      } else {
        this.cleanupTrap?.();
        this.cleanupTrap = null;
      }
    },

    close() {
      if (!this.open) return;
      this.open = false;
      document.body.style.overflow = "";
      this.cleanupTrap?.();
      this.cleanupTrap = null;
    },
  };
}
```

### Escape key

`handleEscapeKey()` in `focus.ts:205-226` already calls `globalThis.closeSidebar?.()` when `#layout-sidebar` has class `open`. Ensure `sidebar.ts` adds `open` class to `#layout-sidebar` so the existing Escape handler closes the drawer without modification.

## Acceptance Criteria

- [ ] `uiStore.swipeGesturesEnabled === false` disables sidebar swipe gestures
- [ ] Off-canvas drawer slides in from left on `<=768px`
- [ ] Backdrop click closes drawer
- [ ] Escape key closes drawer (via existing `handleEscapeKey`)
- [ ] Body scroll locked while drawer open
- [ ] Focus trapped inside drawer while open
- [ ] `prefers-reduced-motion` disables slide animation
- [ ] iOS `100dvh` + `env(safe-area-inset-*)` applied to drawer
- [ ] Existing desktop sidebar behavior unchanged

## Files

| File | Action |
|------|--------|
| `src/frontend/alpine/sidebar.ts` | modify — add swipe opt-in guard + off-canvas support |
| `src/frontend/stores/ui-store.ts` | modify — add `swipeGesturesEnabled` + `drawerOpen` |
| `src/public/css/app.css` | modify — add drawer CSS at mobile breakpoint |

## Related

- `src/frontend/alpine/sidebar.ts` — existing swipe gestures (to be modified)
- `src/frontend/alpine/focus.ts` — existing `trapFocus`
- `src/public/css/app.css:2337` — existing mobile breakpoint
- `src/public/css/app.css:24` — existing `100dvh` pattern


git issue: 4a32f53
