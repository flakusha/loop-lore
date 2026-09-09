# WIRE: Frontend Modal Focus Trap Directive + Alpine x-trap

**Status:** 📝 Draft
**Priority:** High
**Effort:** Small
**Epic:** `epic-frontend-keynav-mobile`
**Depends on:** —

## Summary

Apply the existing `trapFocus` from `src/frontend/alpine/focus.ts` declaratively via an Alpine directive `x-trap` on all htmx-loaded modals. Extend `handleEscapeKey` to also call a registered trap-close handler when a trapped modal is open. When a modal opens, focus moves inside; Tab/Shift+Tab cycle within; Escape closes; focus returns to the trigger on close.

## Current State

- `src/frontend/alpine/focus.ts` already exports `trapFocus(container): () => void` and `FocusPortal` class (`focus.ts:39-157`).
- `src/frontend/alpine/focus.ts:223` already has a global `document.addEventListener("keydown", …)` for Escape that calls `handleEscapeKey()`.
- `handleEscapeKey()` calls `globalThis.closeSidebar?.()` if sidebar is open (`focus.ts:205-226`).
- No Alpine directive exists to wire `trapFocus` declaratively.
- `chat-panels.ts:123` has a `_keydownHandler` that handles Escape priority chain (5 panels deep).

## Design

### Alpine x-trap directive

```ts
// src/frontend/alpine/focus.ts — add directives

Alpine.directive("trap", (el, { expression }, { effect, cleanup }) => {
  // expression is the variable that controls open state (e.g. "open")
  const cleanupTrap = trapFocus(el);
  cleanup(() => cleanupTrap());
});
```

### x-trap-return directive for focus restore

```ts
Alpine.directive("trap-return", (el, { expression }, { effect }) => {
  // Store el as "return focus here" target
  (el as any).__trapReturn = el;
});
```

### Escape key wiring

`handleEscapeKey()` in `focus.ts:205-226` already calls `closeSidebar?.()` when sidebar is open. Extend it to also call registered modal close handlers:

```ts
// focus.ts — extend
let activeTrapClose: (() => void) | null = null;
export function registerTrapClose(handler: () => void): () => void {
  const prev = activeTrapClose;
  activeTrapClose = handler;
  return () => { if (activeTrapClose === handler) activeTrapClose = prev; };
}

export function handleEscapeKey(): void {
  const sidebar = document.querySelector("#layout-sidebar");
  if (sidebar?.classList.contains("open")) {
    globalThis.closeSidebar?.();
    return;
  }
  if (activeTrapClose) { activeTrapClose(); return; }
  if (escapeKeyHandler) { escapeKeyHandler(); }
}
```

### Modal integration in templates

```html
<!-- Example usage in any modal partial -->
<div x-data="modal()"
     x-show="open"
     x-trap="open"
     x-trap-return="#modal-trigger"
     role="dialog"
     aria-modal="true"
     aria-labelledby="modal-title">
  <!-- modal content -->
</div>
```

htmx swaps re-initialize Alpine directives automatically — no JS changes needed on the htmx side.

## Acceptance Criteria

- [ ] `x-trap` directive registers `trapFocus` on the element
- [ ] `x-trap-return` stores return-to element for focus restoration
- [ ] Tab cycles within modal; Shift+Tab cycles backward
- [ ] Escape closes modal and returns focus to `#modal-trigger`
- [ ] Works on htmx-loaded modals (Alpine re-initialises on htmx swap)
- [ ] `chat-panels.ts` Escape priority chain is unchanged (existing behavior preserved)
- [ ] Unit test: focus trap integration

## Files

| File | Action |
|------|--------|
| `src/frontend/alpine/focus.ts` | modify — add directives, extend `handleEscapeKey` |
| `src/frontend/alpine/focus.test.ts` | modify — add directive tests |

## Related

- `src/frontend/alpine/focus.ts` — existing `trapFocus` and `handleEscapeKey`
- `src/frontend/alpine/focus.test.ts` — existing tests
- `src/frontend/alpine/chat-panels.ts:71-140` — existing `_keydownHandler` Escape chain
