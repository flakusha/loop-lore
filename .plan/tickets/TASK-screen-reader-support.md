<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Screen Reader Support

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-accessibility-input

## Summary

Implement screen reader support with ARIA labels, live regions, semantic HTML, and screen reader announcements. Required for WCAG 2.1 AA compliance.

## Acceptance Criteria

- [x] ARIA labels on all interactive elements
- [x] Live regions for dynamic content
- [x] Semantic HTML structure
- [x] Alt text for images/icons
- [x] Screen reader announcements for state changes
- [ ] Proper heading hierarchy
- [x] Landmark regions

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

## Implementation Notes (branch p0-a11y-responsive, 2026-11-01)

Landed the core screen-reader navigation slice; four of five open ACs are
closed. What shipped, by AC:

- **Semantic HTML structure** — every main view header now renders its page
  title as a real `<h1 class="title">` (was `<span>`; 18 headers + the chat
  header, `.main-header .title` gained `margin: 0` so layout is unchanged).
  The nested-main bug is gone: `#app-root` dropped `role="main"`, so each
  view's single `<main class="main-content">` is the page's only main
  landmark (`ui.ts` / `focus.ts` fallback selectors already match
  `#app-root`, so focus restoration is unaffected). Landmarks verified:
  `<aside aria-label>` sidebar + `<nav aria-label>` + per-view `<main>` +
  skip link (`#app-root`, first focusable element; hidden only in print).
- **Alt text for images/icons** — all icon-only buttons now carry accessible
  names: hamburgers (`accessibility.toggleSidebar`, all 15 header files,
  replacing three hardcoded English labels), sidebar settings gear,
  message-action buttons (title mirrored into `aria-label`), panel/modal
  close buttons (`common.close` / `common.remove`), branch-merge
  up/down/remove (new `branches.moveUp`/`branches.moveDown` keys),
  notification dismiss/mark-read, chat-list rename/pin/unarchive/delete,
  memory-panel edit/pin/jump, and `aria-label`s on the nine unnamed
  right-panel `<aside>`s (reusing each panel's own heading key). Avatars
  already carried `alt` (`accessibility.userAvatar`).
- **Screen reader announcements for state changes** — the battle panel now
  renders a persistent `aria-live="polite" aria-atomic="true"` `.sr-only`
  announcer (`battle/panel-live.ts`, survives the full re-render wipes and
  only rewrites text when round/turn/status actually change; announces
  "Round N: X's turn" and "Battle ended"). The SSE-driven world conditions
  strip is a polite live region. Toast container, banner and ticker live
  regions pre-existed.
- **Proper heading hierarchy** — partial, intentionally left unchecked: the
  per-page `<h1>` landed, but settings/admin sections still start at `h3`
  under the `h1` (h2 level skipped). Fixing those section levels is the
  remaining polish; deep admin screens are out of this slice's scope.

Also in this slice (keyboard side of navigation): battle `1-9` action slots,
world-page `g i`/`g l`/`g t` focus jumps, and ↑/↓ selection with focus
follow in the inventory item list — see the epic Phase 3/4 notes.

Unit coverage: `battle/panel-live.test.ts` (slot dispatch, announcements,
live-region persistence), `inventory.test.ts` (`moveSelection`). Gates:
`bun run typecheck:frontend`, scoped `eslint`/`dprint`, `lint:css`,
`markuplint`, `bun run i18n:check` (9/9 locales), battle + shortcuts +
inventory + world suites — all green.

## Related Tasks

- TASK-keyboard-navigation.md
- TASK-mobile-touch-gestures.md
- TASK-responsive-design.md
