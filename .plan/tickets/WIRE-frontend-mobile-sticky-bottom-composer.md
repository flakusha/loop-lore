# WIRE: Frontend Mobile Sticky Bottom Composer Bar

**Status:** 📝 Draft
**Priority:** High
**Effort:** Small
**Epic:** `epic-frontend-keynav-mobile`
**Depends on:** —

## Summary

On mobile viewports (`<=768px`), add a sticky bottom composer bar that stays visible while typing. Addresses the iOS Safari 100vh bug via `100dvh` units (already used at `app.css:24`) and `env(safe-area-inset-*)`. The bar reuses the existing `hx-post="/chat/:id/message"` endpoint.

## Current State

- `src/components/chat/input-area.html` exists — existing desktop composer (not `src/views/`).
- No sticky bottom bar exists for mobile.
- `src/public/css/app.css:24` — `100dvh` pattern already exists (viewport fix).
- `src/public/css/app.css:704` — `@media (width <= 767px)` mobile breakpoint exists.
- `src/public/css/app.css:2337` — `@media (width <= 768px)` another mobile breakpoint.
- `src/frontend/touch.ts` has `prefersReducedMotion()` gating.

## Design

### New partial

```html
<!-- src/components/chat/mobile-composer.html (new) -->

<div class="mobile-composer"
     x-data="mobileComposer()"
     x-show="isMobile"
     x-cloak
     aria-label="Mobile message composer">
  <form hx-post="/chat/{chatId}/message"
        hx-swap="beforeend"
        hx-trigger="submit"
        class="mobile-composer__form">
    <input type="text"
           name="content"
           x-ref="input"
           placeholder="Message..."
           autocomplete="off"
           @keydown.enter.prevent="submitForm()"
           class="mobile-composer__input" />
    <button type="submit" class="mobile-composer__send" aria-label="Send">
      <!-- send icon -->
    </button>
  </form>
</div>
```

### Alpine component

```ts
// src/frontend/alpine/mobile-composer.ts (new)

export function mobileComposer() {
  return {
    isMobile: matchMedia("(max-width: 768px)").matches,

    init() {
      this._unlisten = matchMedia("(max-width: 768px)").addEventListener(
        "change",
        (e) => { this.isMobile = e.matches; },
      );
    },

    destroy() { this._unlisten?.(); },

    submitForm() {
      const form = this.$refs.form as HTMLFormElement | null;
      if (!form) return;
      htmx.trigger(form, "submit");
    },
  };
}
```

### CSS (extend app.css mobile breakpoint)

```css
/* src/public/css/app.css — extend @media (width <= 768px) at :2337 */

.mobile-composer {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: calc(60px + env(safe-area-inset-bottom, 0));
  /* 100dvh fallback for browsers without env() support */
  @supports (height: 100dvh) {
    height: calc(60px + env(safe-area-inset-bottom, 0));
  }
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  z-index: 30;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
}

.mobile-composer__input {
  flex: 1;
  min-width: 0;
}

.mobile-composer__send {
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .mobile-composer { transition: none; }
}
```

### Include in chat view

In `src/components/chat/chat.html` or the Alpine chat component template, include the partial conditionally:

```html
<div x-data="chatState()">
  <!-- existing chat content -->
  <include src="components/chat/mobile-composer.html"></include>
</div>
```

## Acceptance Criteria

- [ ] Mobile composer bar appears at bottom of screen on `<=768px`
- [ ] Input submits via existing `hx-post="/chat/:id/message"`
- [ ] Enter key submits without inserting newline
- [ ] `100dvh` + `env(safe-area-inset-*)` prevents iOS keyboard from shifting layout
- [ ] `prefers-reduced-motion` disables any transitions
- [ ] Desktop composer is unaffected
- [ ] Visual e2e test on 375×812 viewport

## Files

| File | Action |
|------|--------|
| `src/components/chat/mobile-composer.html` | new |
| `src/frontend/alpine/mobile-composer.ts` | new |
| `src/public/css/app.css` | modify — add composer CSS at mobile breakpoint |
| `src/components/chat/chat.html` | modify — include mobile-composer partial |

## Related

- `src/components/chat/input-area.html` — existing desktop composer
- `src/public/css/app.css:24` — existing `100dvh` pattern
- `src/public/css/app.css:2337` — existing mobile breakpoint
