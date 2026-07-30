# TASK: Keyboard Navigation System

**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-accessibility-input

## Summary

Implement keyboard navigation system with tab order management, focus trapping for modals, skip links, and focus restoration. Required for WCAG 2.1 AA compliance.

## Acceptance Criteria

- [ ] Tab order logical across all pages
- [ ] Focus visible indicators (2px outline, high contrast)
- [ ] Focus trapping in modals/popups
- [ ] Escape to close modals
- [ ] Skip links for main content
- [ ] Focus restoration after modal close
- [ ] No keyboard traps
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
