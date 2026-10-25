<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# WIRE: Frontend Keyboard Navigation Help Overlay (`?`)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress — overlay wired 2026-10-25 (`a11y-keynav-phase3`); focus trap ACs remain open
**Priority:** Medium
**Effort:** Small
**Epic:** (none — proposed epic never materialized)
**Epic Note:** original value "`epic-frontend-keynav-mobile`" preserved 2026-10-23; no epic file exists.
**Depends on:** `WIRE-frontend-keyboard-navigation-global-keymap.md`

## Summary

Implement the `?` keyboard shortcut help overlay. Opened by the `?` key (dispatched as `keynav:toggle-help` custom event from `shortcuts.ts`), it reads shortcuts from the keymap registry and renders a keyboard-accessible, i18n-localised table. Focus is trapped via `trapFocus`, returns to the trigger on close.

## Current State

- `WIRE-frontend-keyboard-navigation-global-keymap.md` wires `?` to dispatch `window.dispatchEvent(new CustomEvent("keynav:toggle-help"))`.
- `src/frontend/alpine/focus.ts` has `FocusPortal` for focus-trap + focus-restore.
- `src/frontend/alpine/chat-panels.ts:123` uses `document.addEventListener("keydown", …)` for Ctrl+J — Escape chain is in `focus.ts:223`.
- `src/frontend/alpine/i18n.ts` exists — `$t()` magic in templates.
- No help overlay component exists yet.
- No `frontend.keynav.*` i18n keys exist yet.

## Design

### Alpine component

```ts
// src/frontend/alpine/keynav-help.ts (new)

import { getKeymap } from "./shortcuts";

export function keynavHelp() {
  return {
    open: false,
    shortcuts: [] as ReturnType<typeof getKeymap>,

    init() {
      window.addEventListener("keynav:toggle-help", () => this.toggle());
      this.shortcuts = getKeymap();
    },

    toggle() {
      this.open = !this.open;
      document.body.style.overflow = this.open ? "hidden" : "";
    },
  };
}
```

### Partial

```html
<!-- src/components/chat/keynav-help.html (new) -->

<div x-data="keynavHelp()"
     x-show="open"
     x-cloak
     class="keynav-help-overlay"
     role="dialog"
     aria-modal="true"
     aria-label="Keyboard shortcuts"
     x-trap="open">
  <div class="keynav-help__panel" @click.stop>
    <header class="keynav-help__header">
      <h2 id="keynav-help-title" i18n="frontend.keynav.help.title">
        Keyboard Shortcuts
      </h2>
      <button @click="open = false" aria-label="Close" class="keynav-help__close">
        ×
      </button>
    </header>
    <table class="keynav-help__table" aria-labelledby="keynav-help-title">
      <thead>
        <tr>
          <th i18n="frontend.keynav.help.col.key">Key</th>
          <th i18n="frontend.keynav.help.col.action">Action</th>
        </tr>
      </thead>
      <tbody>
        <template x-for="s in shortcuts" :key="s.action">
          <tr>
            <td><kbd x-text="s.combo"></kbd></td>
            <td i18n="s.label"></td>
          </tr>
        </template>
      </tbody>
    </table>
    <p class="keynav-help__footer" i18n="frontend.keynav.help.hint">
      Press <kbd>?</kbd> to toggle this overlay
    </p>
  </div>
</div>
```

### CSS

```css
/* src/public/css/app.css — add */

.keynav-help-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.keynav-help__panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  max-width: 480px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
}

kbd {
  display: inline-block;
  padding: 2px 6px;
  font-family: monospace;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .keynav-help-overlay { transition: none; }
}
```

### i18n keys (add to existing locale files)

```json
{
  "frontend": {
    "keynav": {
      "help": {
        "title": "Keyboard Shortcuts",
        "col": { "key": "Key", "action": "Action" },
        "hint": "Press ? to toggle this overlay",
        "toggle": "Show keyboard shortcuts",
        "close": "Close overlay",
        "goto.top": "Go to top",
        "goto.prev_chat": "Previous chat",
        "goto.chat_list": "Go to chat list",
        "goto.settings": "Go to settings",
        "goto.chars": "Go to characters",
        "goto.home": "Go to home",
        "prev_chat": "Previous chat",
        "next_chat": "Next chat",
        "msg.next": "Next message",
        "msg.prev": "Previous message"
      }
    }
  }
}
```

## Acceptance Criteria

- [x] `?` key opens the help overlay
- [x] Overlay reads shortcuts from `getKeymap()` registry
- [x] All strings are i18n-localised (no hardcoded English labels)
- [x] Escape closes the overlay
- [ ] Focus is trapped inside overlay while open (`@alpinejs/focus` not loaded; `x-trap` from the original design is not in effect — markup stays keyboard-accessible, Tab reaches the close control)
- [ ] Focus returns to previously focused element on close
- [x] `prefers-reduced-motion` disables overlay animation
- [x] Overlay is keyboard-accessible (Tab navigation works)
- [x] Unit test: overlay open/close state (`src/frontend/alpine/keynav-help.test.ts`); focus trap still untested (no trap)

## Implementation Note (2026-10-25, `a11y-keynav-phase3`)

Wired, but with two deviations from the original design:

1. `resolveIncludes()` runs only on view content (`loadView`), never on the
   layout itself, so `{{> keynav-help.html}}` in `layout.html` would have
   rendered literally. The overlay markup was inlined into `layout.html`
   (sidebar footer, opt-in help button) and the now-redundant
   `src/components/chat/keynav-help.html` partial was removed.
2. `src/public/css/**` was off-limits on the branch (sibling worktrees), so
   the pre-existing `mobile-keynav.css` (previously referenced by nothing)
   is linked from the layout instead of appending rules to `app.css`.

`keynavHelp()` now also gates the help button on the `keynav` flag
(`navEnabled`), re-reads the keymap on every open (rebound combos show up
without a reload), and is registered in the Alpine bundle
(`src/frontend/alpine/index.ts`) and `window-types.ts`.

## Files

| File | Action |
|------|--------|
| `src/frontend/alpine/keynav-help.ts` | new |
| `src/frontend/alpine/keynav-help.test.ts` | new |
| `src/components/chat/keynav-help.html` | new |
| `src/public/css/app.css` | modify — add overlay CSS |
| `src/i18n/locales/en.json` | modify — add `frontend.keynav.*` keys |
| `src/views/layout.html` | modify — include `keynav-help.html` |

## Related

- `src/frontend/alpine/focus.ts` — existing `FocusPortal`, `trapFocus`
- `src/frontend/alpine/shortcuts.ts` — keymap registry + `keynav:toggle-help` event
- `src/frontend/alpine/i18n.ts` — existing `$t()` magic


git issue: 837bc93
