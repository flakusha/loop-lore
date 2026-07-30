# TASK: Screen Reader Support

**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-accessibility-input

## Summary

Implement screen reader support with ARIA labels, live regions, semantic HTML, and screen reader announcements. Required for WCAG 2.1 AA compliance.

## Acceptance Criteria

- [ ] ARIA labels on all interactive elements
- [ ] Live regions for dynamic content
- [ ] Semantic HTML structure
- [ ] Alt text for images/icons
- [ ] Screen reader announcements for state changes
- [ ] Proper heading hierarchy
- [ ] Landmark regions

## Implementation Details

### ARIA Labels

```html
<!-- Button with ARIA label -->
<button aria-label="Close dialog" aria-describedby="dialog-title">
  <span aria-hidden="true">×</span>
</button>

<!-- Input with ARIA label -->
<label for="chat-input">Message</label>
<input
  id="chat-input"
  type="text"
  aria-required="true"
  aria-invalid="false"
  aria-describedby="chat-input-help"
>
<span id="chat-input-help">Press Enter to send</span>

<!-- Icon button with ARIA label -->
<button aria-label="Toggle sidebar">
  <span aria-hidden="true">☰</span>
</button>
```

### Live Regions

```html
<!-- Polite announcements (non-urgent) -->
<div
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
  id="status-announcer"
>
  <!-- Dynamic content announced here -->
</div>

<!-- Assertive announcements (urgent) -->
<div
  aria-live="assertive"
  aria-atomic="true"
  class="sr-only"
  id="error-announcer"
>
  <!-- Error messages announced here -->
</div>

<!-- Status updates -->
<div
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
  id="battle-announcer"
>
  <!-- Battle state changes announced here -->
</div>
```

### Semantic HTML

```html
<!-- Proper heading hierarchy -->
<h1>Application Title</h1>
<h2>Section Title</h2>
<h3>Subsection Title</h3>

<!-- Landmark regions -->
<header role="banner">
  <nav aria-label="Main navigation">...</nav>
</header>

<main role="main">
  <article>
    <h2>Chat Messages</h2>
    <section aria-label="Message list">...</section>
  </article>
</main>

<aside role="complementary">
  <nav aria-label="Sidebar navigation">...</nav>
</aside>

<footer role="contentinfo">...</footer>
```

### Screen Reader Utility Functions

```typescript
// src/frontend/a11y/screen-reader.ts
export class ScreenReaderManager {
  private statusAnnouncer: HTMLElement;
  private errorAnnouncer: HTMLElement;

  constructor() {
    this.statusAnnouncer = document.getElementById("status-announcer",)!;
    this.errorAnnouncer = document.getElementById("error-announcer",)!;
  }

  // Announce status change
  announceStatus(message: string,): void {
    this.statusAnnouncer.textContent = message;
  }

  // Announce error
  announceError(message: string,): void {
    this.errorAnnouncer.textContent = message;
  }

  // Announce battle event
  announceBattle(message: string,): void {
    const announcer = document.getElementById("battle-announcer",);
    if (announcer) {
      announcer.textContent = message;
    }
  }

  // Announce navigation
  announceNavigation(message: string,): void {
    this.statusAnnouncer.textContent = `Navigated to ${message}`;
  }

  // Announce action completion
  announceAction(action: string, result: string,): void {
    this.statusAnnouncer.textContent = `${action}: ${result}`;
  }
}
```

### Alt Text for Icons

```html
<!-- Icon with alt text -->
<img src="icon.svg" alt="Close" aria-hidden="true">
<span aria-hidden="true">✓</span>
<span class="sr-only">Success</span>

<!-- Decorative icon (hidden from screen readers) -->
<span aria-hidden="true">🎨</span>
```

### Screen Reader Only CSS

```css
/* Visually hidden but available to screen readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Show on focus for keyboard users */
.sr-only-focusable:focus {
  position: static;
  width: auto;
  height: auto;
  padding: inherit;
  margin: inherit;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

## Files to Create

- `src/frontend/a11y/screen-reader.ts`
- `src/frontend/a11y/aria-labels.ts`
- `src/frontend/a11y/sr-only.css`

## Related Tasks

- TASK-keyboard-navigation.md
- TASK-mobile-touch-gestures.md
- TASK-responsive-design.md
