<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# WIRE: Frontend Global Keyboard Navigation Keymap (Opt-In)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 📝 Draft
**Priority:** High
**Effort:** Medium
**Epic:** `epic-frontend-keynav-mobile`
**Depends on:** —

## Summary

Refactor `src/frontend/alpine/shortcuts.ts` from a hardcoded Ctrl+B/N/L/K if/else chain into an array-based keymap registry with an opt-in flag. Add the following shortcuts (vim-style `g <key>` sequences):

| Key | Action |
|-----|--------|
| `?` | Toggle help overlay |
| `g g` | Go to top / first item |
| `g p` | Go to previous chat |
| `g c` | Go to chat list |
| `g s` | Go to settings |
| `g a` | Go to characters |
| `g h` | Go to home |
| `Escape` | Close overlay / drawer / modal |
| `[` | Previous chat |
| `]` | Next chat |
| `j` | Next message |
| `k` | Previous message |
| `Enter` | Send message (in composer) |

Shortcuts are disabled inside `<input>`/`<textarea>` elements and when `uiStore.keynavEnabled === false`.

## Current State

- `src/frontend/alpine/shortcuts.ts` **already exists** with Ctrl+B/N/L/K shortcuts hardcoded as `if/else`.
- `src/frontend/alpine/index.ts` already imports `./shortcuts`.
- `src/frontend/alpine/focus.ts` already has `handleEscapeKey` with global Escape listener.
- `src/frontend/stores/ui-store.ts` has no `keynavEnabled` field.
- `src/config/schema/frontend.ts` only has `mode`.

## Design

### Refactor shortcuts.ts to array-based registry

```ts
// src/frontend/alpine/shortcuts.ts — existing file, refactor

export interface KeymapEntry {
  combo: string;         // e.g. "g g", "j", "Escape"
  action: string;        // action name
  label: string;         // i18n key
  ignoreInInput?: boolean;
  /** e.g. "chat", "global" — scope for future extension */
  scope?: string;
}

const DEFAULT_KEYMAP: KeymapEntry[] = [
  { combo: "?",           action: "toggle-help",   label: "frontend.keynav.help.toggle",    scope: "global" },
  { combo: "g g",         action: "goto-top",      label: "frontend.keynav.goto.top",       scope: "global" },
  { combo: "g p",         action: "goto-prev",     label: "frontend.keynav.goto.prev_chat", scope: "global" },
  { combo: "g c",         action: "goto-chatlist", label: "frontend.keynav.goto.chat_list", scope: "global" },
  { combo: "g s",         action: "goto-settings",  label: "frontend.keynav.goto.settings",  scope: "global" },
  { combo: "g a",         action: "goto-chars",    label: "frontend.keynav.goto.chars",     scope: "global" },
  { combo: "g h",         action: "goto-home",     label: "frontend.keynav.goto.home",      scope: "global" },
  { combo: "Escape",      action: "close",         label: "frontend.keynav.close",            scope: "global" },
  { combo: "[",           action: "prev-chat",     label: "frontend.keynav.prev_chat",      scope: "chat"   },
  { combo: "]",           action: "next-chat",     label: "frontend.keynav.next_chat",      scope: "chat"   },
  { combo: "j",           action: "msg-next",      label: "frontend.keynav.msg.next",        scope: "chat"   },
  { combo: "k",           action: "msg-prev",     label: "frontend.keynav.msg.prev",        scope: "chat"   },
];

let keymap = [...DEFAULT_KEYMAP];
export function getKeymap(): KeymapEntry[] { return keymap; }

export function isKeyboardNavEnabled(): boolean {
  return (globalThis as any).__looplore?.keynavEnabled !== false;
}
```

### Helix-key parsing (g g, g p, etc.)

```ts
// 500ms buffer for multi-key sequences
let pendingKey: string | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function handleKeyDown(e: KeyboardEvent): void {
  if (!isKeyboardNavEnabled()) return;
  if (isInputFocused()) return;

  if (pendingKey !== null) {
    // Second key of a sequence
    clearTimeout(pendingTimer!);
    const combo = pendingKey + " " + e.key;
    const entry = keymap.find(k => k.combo === combo);
    if (entry) { e.preventDefault(); dispatchAction(entry.action); }
    pendingKey = null;
    return;
  }

  // Check single-key shortcuts
  const entry = keymap.find(k => k.combo === e.key);
  if (!entry) return;

  if (entry.combo.length === 1 && "g".startsWith(entry.combo)) {
    // g is a prefix — wait 500ms for second key
    pendingKey = e.key;
    pendingTimer = setTimeout(() => { pendingKey = null; }, 500);
    return;
  }

  e.preventDefault();
  dispatchAction(entry.action);
}
```

### Input guard

```ts
function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA"
    || el.getAttribute("contenteditable") === "true"
    || el.closest("[data-skip-keynav]");
}
```

### ui-store extension

```ts
// src/frontend/stores/ui-store.ts — add field
export const uiStoreDefinition: Record<string, unknown> = {
  // ... existing fields ...
  keynavEnabled: false,  // opt-in
};
```

### Config extension

```ts
// src/config/schema/frontend.ts
export interface FrontendConfig {
  mode: "htmx" | "spa" | "none";
  keynav?: {
    enabled?: boolean;
  };
}
```

## Acceptance Criteria

- [ ] `shortcuts.ts` refactored to array-based `DEFAULT_KEYMAP` registry
- [ ] All listed shortcuts fire correct actions
- [ ] Shortcuts ignored inside `<input>`/`<textarea>` (unless `[data-skip-keynav]`)
- [ ] `uiStore.keynavEnabled === false` disables all shortcuts
- [ ] `gg` waits 500ms before firing (vim-style helix key)
- [ ] `?` dispatches `keynav:toggle-help` custom event
- [ ] Unit tests: keymap parsing, combo matching, input guard, action dispatch
- [ ] Existing Ctrl+B/N/L/K shortcuts replaced (not duplicated)

## Files

| File | Action |
|------|--------|
| `src/frontend/alpine/shortcuts.ts` | modify — refactor to registry |
| `src/frontend/stores/ui-store.ts` | modify — add `keynavEnabled` |
| `src/config/schema/frontend.ts` | modify — add `keynav.enabled` |
| `src/config/schema-class/frontend.ts` | modify — add `keynav` defaults |

## Related

- `src/frontend/alpine/focus.ts` — existing `handleEscapeKey`
- `WIRE-frontend-keyboard-help-overlay.md` — help overlay component
