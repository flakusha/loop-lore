# TASK: Responsive Design System

**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-accessibility-input

## Summary

Implement responsive design system with breakpoints, fluid typography, flexible layouts, and mobile-first CSS approach. Ensures application works across all device sizes.

## Acceptance Criteria

- [ ] Breakpoints: <480px, 480-768px, 768-1200px, >1200px
- [ ] Fluid typography scaling
- [ ] Flexible grid layouts
- [ ] Mobile-first CSS approach
- [ ] Touch vs. mouse detection
- [ ] Reduced motion support
- [ ] High contrast mode support
- [ ] Print styles

## Implementation Details

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

## Files to Create

- `src/frontend/a11y/responsive.ts`
- `src/frontend/a11y/breakpoints.css`
- `src/frontend/a11y/typography.css`
- `src/frontend/a11y/grid.css`
- `src/frontend/a11y/print.css`

## Related Tasks

- TASK-keyboard-navigation.md
- TASK-mobile-touch-gestures.md
- TASK-screen-reader-support.md
