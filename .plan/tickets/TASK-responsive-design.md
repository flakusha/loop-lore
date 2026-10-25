<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Responsive Design System

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-accessibility-input

## Summary

Implement responsive design system with breakpoints, fluid typography, flexible layouts, and mobile-first CSS approach. Ensures application works across all device sizes.

## Acceptance Criteria

- [x] Breakpoints: <480px, 480-768px, 768-1200px, >1200px — tier map lives in `responsive.css`; mobile tier additionally collapses `.rpg-stats-grid`; the pre-existing ≤480/≤768/≤900 one-off blocks in `app.css` are retained as the per-surface behavior of each tier
- [x] Fluid typography scaling — `clamp()` overrides for the shared `--fs-lg` … `--fs-display` tokens (pixel-identical at ≥1200px, floored on phones); reading sizes (`xs`–`md`) intentionally stay fixed for legibility
- [x] Flexible grid layouts — `.asset-grid` was already fluid (`auto-fill`/`minmax`); `.rpg-stats-grid` now collapses to one column under 480px
- [x] Mobile-first CSS approach — `responsive.css` is authored mobile-first (base = smallest tier, `min-width` tiers layer up); converting legacy `app.css` blocks is out of scope (see notes)
- [x] Touch vs. mouse detection — `createInputModeTracker()` factory in `src/frontend/a11y/responsive.ts` (snapshot + `touch-user`/`mouse-user` classes, hybrid-safe); coarse-pointer CSS targets pre-existed; module is unwired so far (no JS consumer yet)
- [x] Reduced motion support — global `0.01ms` duration clamp added as an umbrella over the pre-existing per-component blocks (also stops spinner/typing-dot keyframes)
- [x] High contrast mode support — `(prefers-contrast: more)` (the draft's `high` value does not parse): muted-text and border tokens remapped to the active theme's `--text-secondary`, focus outline thickened
- [x] Print styles — `@media print` block: `.no-print`/`.print-only` utilities, app chrome stripped, black-on-white, external link URLs revealed

## Implementation Details

> Drafts below are kept for history only — do NOT paste them: the CSS
> contains invalid values (`background-color: opaque`) and `* { … !important }
> rules that would repaint the whole UI; `prefers-contrast: high` is not a
> valid MQ value (`more` is); CSS custom properties cannot be used inside
> media queries, so `--breakpoint-*` tokens are impossible (breakpoints are
> literal tier blocks); the `InputDetector` class contradicts the repo's
> factory-function convention. See "Implementation Notes" for what shipped.

### Breakpoint System

```css
/* Mobile-first breakpoints */
:root {
  --breakpoint-sm: 480px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1200px;
  --breakpoint-xl: 1600px;
}

/* Mobile: <480px */
@media (max-width: 479px) {
  .container {
    padding: 8px;
  }

  .sidebar {
    display: none;
  }

  .content {
    width: 100%;
  }
}

/* Tablet: 480-768px */
@media (min-width: 480px) and (max-width: 767px) {
  .container {
    padding: 16px;
  }

  .sidebar {
    position: fixed;
    z-index: 100;
  }

  .content {
    width: 100%;
  }
}

/* Desktop: 768-1200px */
@media (min-width: 768px) and (max-width: 1199px) {
  .container {
    padding: 24px;
  }

  .sidebar {
    width: 300px;
  }

  .content {
    width: calc(100% - 300px);
  }
}

/* Wide: >1200px */
@media (min-width: 1200px) {
  .container {
    padding: 32px;
  }

  .sidebar {
    width: 300px;
  }

  .content {
    width: calc(100% - 300px);
  }

  .right-panel {
    width: 300px;
  }
}
```

### Fluid Typography

```css
/* Fluid typography using clamp() */
:root {
  --font-size-sm: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
  --font-size-base: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);
  --font-size-lg: clamp(1rem, 0.9rem + 0.5vw, 1.25rem);
  --font-size-xl: clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem);
  --font-size-2xl: clamp(1.5rem, 1.3rem + 1vw, 2rem);
  --font-size-3xl: clamp(2rem, 1.7rem + 1.5vw, 2.5rem);
}

/* Line height scaling */
:root {
  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;
}
```

### Flexible Grid System

```css
/* CSS Grid with auto-fit and minmax */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

/* Flexbox with wrapping */
.flex-container {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.flex-item {
  flex: 1 1 250px;
  min-width: 250px;
}

/* Responsive grid variations */
.grid-2 {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.grid-3 {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.grid-4 {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
```

### Touch vs. Mouse Detection

```typescript
// src/frontend/a11y/responsive.ts
export class InputDetector {
  private isTouchDevice: boolean = false;
  private isMouseDevice: boolean = false;

  constructor() {
    this.detectInputType();
  }

  private detectInputType(): void {
    // Touch detection
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
      this.isTouchDevice = true;
    }

    // Mouse detection
    window.addEventListener("mousemove", () => {
      this.isMouseDevice = true;
      document.body.classList.add("mouse-user",);
      document.body.classList.remove("touch-user",);
    },);

    window.addEventListener("touchstart", () => {
      this.isTouchDevice = true;
      document.body.classList.add("touch-user",);
      document.body.classList.remove("mouse-user",);
    },);
  }

  // Get appropriate touch target size
  getTouchTargetSize(): number {
    return this.isTouchDevice ? 48 : 32;
  }

  // Check if touch gestures should be enabled
  isTouchEnabled(): boolean {
    return this.isTouchDevice;
  }
}
```

### Reduced Motion Support

```css
/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* Disable animations globally */
  .no-animation {
    animation: none !important;
    transition: none !important;
  }
}
```

### High Contrast Mode

```css
/* High contrast mode support */
@media (prefers-contrast: high) {
  :root {
    --bg-primary: #000000;
    --bg-secondary: #1a1a1a;
    --text-primary: #ffffff;
    --text-secondary: #e0e0e0;
    --accent-primary: #00ffff;
    --accent-secondary: #ff00ff;
    --border-default: #ffffff;
  }

  /* Increase border widths */
  * {
    border-width: 2px !important;
  }

  /* Remove transparency */
  * {
    background-color: opaque !important;
  }
}
```

### Print Styles

```css
/* Print styles */
@media print {
  .no-print {
    display: none !important;
  }

  .print-only {
    display: block !important;
  }

  body {
    font-size: 12pt;
    line-height: 1.5;
    color: #000;
    background: #fff;
  }

  a {
    text-decoration: underline;
    color: #000;
  }

  a[href]::after {
    content: " (" attr(href) ")";
    font-size: 0.8em;
  }
}
```

## Files Shipped (revised from draft)

- `src/public/css/responsive.css` — one cohesive responsive layer
  (breakpoint tier map, fluid typography, grid fix, reduced motion, high
  contrast, print), replacing the draft's four separate stylesheets to
  match the repo's main-stylesheet-plus-satellites CSS architecture; linked
  last from `src/views/layout.html`
- `src/frontend/a11y/responsive.ts` — input-mode tracker factory
  (`createInputModeTracker()`, options-object, no class, no module state)
- `src/frontend/a11y/responsive.test.ts` — unit tests (matchMedia/pointer/
  classList fakes, no DOM)

## Implementation Notes (branch a11y-responsive-design, 2026-10-25)

Landed on the branch, pending review/merge — status stays In Progress
until then.

**Reused, not duplicated:** coarse-pointer 44px touch targets and the
per-component reduced-motion blocks in `app.css`/`vn.css`/`info-bubble.css`,
`:focus-visible` outlines, skip link, viewport meta, the drawer sidebar
(that the draft's sidebar media queries re-implemented), and the fluid
`.asset-grid`. The hover media query in the tracker mirrors
`alpine/info-bubble.ts` so JS and CSS agree.

**Scope carve-outs:** legacy `app.css` stays desktop-first — only the new
layer is mobile-first, so the AC is met by the added layer, not by a
wholesale conversion; raw px `font-size` declarations inside components are
not tokenized and therefore do not scale with the fluid tokens; the tracker
is unwired (no JS consumer yet — same tracked status as `touch.ts`, and a
follow-up wiring ticket is the natural next step); the draft's
`getTouchTargetSize()` JS API is dropped — target sizing already belongs to
CSS. No i18n strings were needed (pure CSS + one class-toggling utility).

**Gates (scoped, no full check run):** `bunx stylelint
"src/public/**/*.css"`, `bun run typecheck:frontend`, scoped `eslint` +
`dprint` on the new module, `markuplint` on `layout.html`, single-file
`bun test src/frontend/a11y/responsive.test.ts`, `bun run size`, and a
knip files pass — all green; the unit suite exercises snapshot
construction, degradation without/with a throwing `matchMedia`, pointer
class switching, change notification, and `stop()` teardown.

## Related Tasks

- TASK-keyboard-navigation.md
- TASK-mobile-touch-gestures.md
- TASK-screen-reader-support.md
