<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Keyboard Navigation System

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-accessibility-input

## Status Note (2026-10-25, `a11y-keynav-phase3`)

The focus-management scope below is delivered by `src/frontend/alpine/focus.ts`
(not the spec's `src/frontend/a11y/focus-manager.ts` — that path was never
created; the shipped surface is the real one). The shortcut layer built on top
of it lives in `src/frontend/alpine/shortcuts.ts` + `keynav-help.ts` + the
Settings keymap editor; see the epic's Phase 3 section for the corrected
history and the remaining open item (context-specific per-page keymaps).
The last unchecked AC (screen reader navigation) is tracked by
`TASK-screen-reader-support.md`.

## Summary

Implement keyboard navigation system with tab order management, focus trapping for modals, skip links, and focus restoration. Required for WCAG 2.1 AA compliance.

## Acceptance Criteria

- [x] Tab order logical across all pages
- [x] Focus visible indicators (2px outline, high contrast)
- [x] Focus trapping in modals/popups
- [x] Escape to close modals
- [x] Skip links for main content
- [x] Focus restoration after modal close
- [x] No keyboard traps
- [ ] Screen reader can navigate all content

## Implementation Details

### Focus Management

```typescript
// src/frontend/a11y/focus-manager.ts
export class FocusManager {
  private tabOrder: HTMLElement[] = [];
  private currentFocus: HTMLElement | null = null;
  private focusStack: HTMLElement[] = [];

  // Trap focus within container
  trapFocus(container: HTMLElement,): void {
    const focusable = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    this.tabOrder = Array.from(focusable,);
    this.currentFocus = this.tabOrder[0];
    this.currentFocus?.focus();
  }

  // Release focus trap
  releaseFocus(): void {
    this.tabOrder = [];
    this.currentFocus = null;
  }

  // Save current focus for restoration
  saveFocus(): void {
    this.focusStack.push(document.activeElement as HTMLElement,);
  }

  // Restore previously saved focus
  restoreFocus(): void {
    const previous = this.focusStack.pop();
    previous?.focus();
  }
}
```

### Skip Links

```html
<!-- Skip links for keyboard users -->
<a href="#main-content" class="skip-link">Skip to main content</a>
<a href="#chat-input" class="skip-link">Skip to chat input</a>
<a href="#navigation" class="skip-link">Skip to navigation</a>
```

```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--accent-primary);
  color: white;
  padding: 8px;
  z-index: 100;
}

.skip-link:focus {
  top: 0;
}
```

### Focus Indicators

```css
/* Visible focus for keyboard users */
:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

/* Remove focus ring for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  :focus-visible {
    outline: 3px solid currentColor;
    outline-offset: 3px;
  }
}
```

## Files to Create

- `src/frontend/a11y/focus-manager.ts`
- `src/frontend/a11y/skip-links.ts`
- `src/frontend/a11y/a11y.css`

## Related Tasks

- TASK-keyboard-shortcuts.md
- TASK-mobile-touch-gestures.md
- TASK-screen-reader-support.md
