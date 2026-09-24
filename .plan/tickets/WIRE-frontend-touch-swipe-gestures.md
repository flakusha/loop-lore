<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# WIRE: Frontend Touch Gestures — Swipe Navigation + Pull-to-Refresh (Opt-In)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 📝 Draft
**Priority:** Medium
**Effort:** Medium
**Epic:** `epic-frontend-keynav-mobile`
**Depends on:** —

## Summary

Extend the existing `src/frontend/touch.ts` `onSwipe` with higher-level gesture handlers (swipe left/right on chat list for prev/next chat, pull-to-refresh on chat view). Fix `prefersReducedMotion()` to check at runtime, not module-load time. All gestures are opt-in via `uiStore.swipeGesturesEnabled`.

## Current State

- `src/frontend/touch.ts` **already exists** with `onSwipe(element, options)` using passive `touchstart`/`touchend` listeners.
- `prefersReducedMotion()` in `touch.ts:41-43` is evaluated at **module load time** — if OS preference changes at runtime, gesture behavior doesn't update.
- `onSwipe` does NOT check `prefersReducedMotion` at call time — it should bail early in `onStart`.
- No swipe-gesture integration with chat-list or chat view exists.
- No pull-to-refresh exists.
- `src/frontend/alpine/sidebar.ts` already has swipe gestures (independent of `touch.ts`).

## Design

### Fix prefersReducedMotion runtime check

```ts
// src/frontend/touch.ts — fix existing function

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// In onSwipe, onStart:
const onStart = (e: Event): void => {
  if (prefersReducedMotion()) return;  // ← ADD runtime check
  // ...
};
```

### Swipe navigation component (new)

```ts
// src/frontend/alpine/swipe-gestures.ts (new)

import { onSwipe } from "../touch";
import { isKeyboardNavEnabled } from "./shortcuts";

export function swipeChatList() {
  let cleanup: (() => void) | null = null;

  return {
    init() {
      cleanup = onSwipe(this.$el, {
        threshold: 60,
        onSwipe: (dir) => {
          if (!isKeyboardNavEnabled()) return;
          if (dir === "left")  window.location.href = "/chat/prev";
          if (dir === "right") window.location.href = "/chat/next";
        },
      });
    },
    destroy() { cleanup?.(); },
  };
}
```

### Pull-to-refresh (new)

```ts
// src/frontend/alpine/swipe-gestures.ts (extend)

export function pullToRefresh() {
  let startY = 0;
  let pulling = false;
  const THRESHOLD = 80;

  return {
    init() {
      this.$el.addEventListener("touchstart", (e: TouchEvent) => {
        if (window.scrollY > 0) return;
        startY = e.touches[0].clientY;
        pulling = false;
      }, { passive: true });

      this.$el.addEventListener("touchmove", (e: TouchEvent) => {
        const dy = e.touches[0].clientY - startY;
        if (dy > THRESHOLD && !pulling) {
          pulling = true;
          this.$el.classList.add("ptr--active");
        }
      }, { passive: true });

      this.$el.addEventListener("touchend", () => {
        if (pulling) {
          this.$el.classList.remove("ptr--active");
          window.location.reload();
        }
        pulling = false;
      }, { passive: true });
    },
  };
}
```

### UI store extension

```ts
// src/frontend/stores/ui-store.ts — already added in drawer ticket
swipeGesturesEnabled: false,
```

### Chat list integration

```html
<!-- src/components/chat/chat-list.html -->
<div x-data="swipeChatList()">
  <!-- chat list items -->
</div>
```

### CSS for pull-to-refresh indicator

```css
/* src/public/css/app.css — add */
.ptr--active::before {
  content: "↓ Pull to refresh";
  display: block;
  text-align: center;
  font-size: 0.875rem;
  color: var(--color-muted);
}
```

## Acceptance Criteria

- [ ] Swipe-left on chat list → navigate to next chat
- [ ] Swipe-right on chat list → navigate to previous chat
- [ ] `uiStore.swipeGesturesEnabled === false` disables swipe gestures
- [ ] Pull-to-refresh at scroll-top triggers `window.location.reload()`
- [ ] `prefers-reduced-motion` checked at **runtime** (gesture start), not module load
- [ ] All touch listeners are passive
- [ ] Unit tests: direction detection, threshold, prefers-reduced-motion runtime guard

## Files

| File | Action |
|------|--------|
| `src/frontend/touch.ts` | modify — fix `prefersReducedMotion` runtime check |
| `src/frontend/alpine/swipe-gestures.ts` | new |
| `src/frontend/alpine/swipe-gestures.test.ts` | new |
| `src/components/chat/chat-list.html` | modify — add `x-data="swipeChatList()"` |
| `src/public/css/app.css` | modify — add pull-to-refresh CSS |

## Related

- `src/frontend/touch.ts` — existing `onSwipe`, `onTap`, `onLongPress`
- `src/frontend/alpine/shortcuts.ts` — `isKeyboardNavEnabled()`
- `src/frontend/stores/ui-store.ts` — `swipeGesturesEnabled`


git issue: 72a611e
