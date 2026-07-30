# EPIC: Accessibility & Input Systems

**Status:** 🟡 In Progress
**Priority:** P0 — Critical
**Effort:** High
**Type:** Feature Epic
**Tags:** accessibility, a11y, keyboard, mobile, responsive, touch

## Summary

Complete accessibility, keyboard navigation, and mobile support across all frontend pages. Ensures the application is usable by all users regardless of input method or ability.

## Core Features

### Keyboard Navigation

- Tab order management across all components
- Focus visible indicators (2px outline, high contrast)
- Escape to dismiss modals/popups
- Enter/Space to activate buttons
- Arrow keys for navigation in lists/grids
- Shortcut keys for common actions
- Skip links for main content

### Screen Reader Support

- ARIA labels on all interactive elements
- Live regions for dynamic content updates
- Semantic HTML structure (headings, landmarks)
- Alt text for images/icons
- Screen reader announcements for state changes

### Mobile Support

- Touch-friendly tap targets (44x44px minimum)
- Swipe gestures for navigation
- Pull-to-refresh where appropriate
- Bottom sheet for mobile modals
- Haptic feedback for actions
- Viewport meta tag configuration

### Responsive Design

- Breakpoints: <480px, 480-768px, 768-1200px, >1200px
- Fluid typography scaling
- Flexible grid layouts
- Mobile-first CSS approach
- Touch vs. mouse detection

## UI Components

### Focus Management System

```typescript
interface FocusManager {
  // Tab order tracking
  tabOrder: HTMLElement[];
  currentFocus: HTMLElement | null;

  // Focus trapping for modals
  trapFocus(container: HTMLElement,): void;
  releaseFocus(): void;

  // Skip links
  addSkipLink(target: HTMLElement, label: string,): void;

  // Focus restoration
  saveFocus(): void;
  restoreFocus(): void;
}
```

### Keyboard Shortcut System

```typescript
interface KeyboardShortcut {
  id: string;
  key: string;
  modifiers: ("ctrl" | "shift" | "alt" | "meta")[];
  action: () => void;
  description: string;
  context: "global" | "chat" | "battle" | "inventory";
}
```

### Touch Gesture System

```typescript
interface TouchGesture {
  id: string;
  type: "tap" | "swipe" | "pinch" | "long-press";
  direction?: "left" | "right" | "up" | "down";
  action: () => void;
  threshold: number; // pixels
  timeout: number; // ms for long-press
}
```

### Responsive Breakpoints

| Breakpoint | Behavior                               | Touch Targets   |
| ---------- | -------------------------------------- | --------------- |
| <480px     | Mobile: Full-width, stacked layout     | 44x44px minimum |
| 480-768px  | Tablet: Sidebar overlay, bottom sheets | 44x44px minimum |
| 768-1200px | Desktop: Side panels push content      | 32x32px minimum |
| >1200px    | Wide: Full layout with right panel     | 32x32px minimum |

### Mobile-Specific Patterns

```
┌─────────────────────────────────────────┐
│ Mobile (<768px)                         │
├─────────────────────────────────────────┤
│                                         │
│ ┌─ Header ──────────────────────────┐  │
│ │ [☰] Title              [🔍] [👤] │  │
│ └───────────────────────────────────┘  │
│                                         │
│ ┌─ Content ─────────────────────────┐  │
│ │ Full-width, stacked layout        │  │
│ │                                   │  │
│ │ Cards: Full-width, 16px padding   │  │
│ │ Lists: Full-width, swipe actions  │  │
│ │ Forms: Full-width inputs          │  │
│ └───────────────────────────────────┘  │
│                                         │
│ ┌─ Bottom Nav ──────────────────────┐  │
│ │ [🏠] [💬] [🗺️] [🎒] [⚙️]         │  │
│ └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### Desktop Keyboard Shortcuts

| Shortcut | Action             | Context         |
| -------- | ------------------ | --------------- |
| `Ctrl+N` | New chat           | Global          |
| `Ctrl+S` | Save current       | Global          |
| `Escape` | Close modal/cancel | Global          |
| `Enter`  | Confirm/submit     | Global          |
| `↑/↓`    | Navigate list      | Chat, Inventory |
| `←/→`    | Switch panels      | Chat            |
| `Ctrl+B` | Toggle sidebar     | Chat            |
| `Ctrl+I` | Open inventory     | Battle          |
| `Ctrl+M` | Open map           | World           |
| `1-9`    | Select action      | Battle          |

### Mobile Touch Gestures

| Gesture     | Action         | Context         |
| ----------- | -------------- | --------------- |
| Swipe left  | Delete/archive | Chat, Inventory |
| Swipe right | Reply/edit     | Chat            |
| Pull down   | Refresh        | Lists           |
| Long press  | Context menu   | Any item        |
| Pinch       | Zoom           | Map, Images     |
| Double tap  | Quick action   | Buttons         |

### Screen Reader Announcements

```html
<!-- Live region for dynamic updates -->
<div aria-live="polite" aria-atomic="true" class="sr-only">
  <!-- State changes announced here -->
  Message sent successfully Battle started with 3 enemies Location discovered: Darkwood
</div>

<!-- Status announcements -->
<div aria-live="assertive" aria-atomic="true" class="sr-only">
  <!-- Critical updates -->
  Error: Failed to save Network connection lost
</div>
```

### Focus Indicators

```css
/* Visible focus for keyboard users */
:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  :focus-visible {
    outline: 3px solid currentColor;
    outline-offset: 3px;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

## Integration Points

### Shared Components

| Component | Accessibility Features         | Mobile Features        |
| --------- | ------------------------------ | ---------------------- |
| Modal     | Focus trap, Escape to close    | Bottom sheet on mobile |
| Dropdown  | Arrow key navigation           | Full-width on mobile   |
| Tab panel | Arrow key switching            | Swipe to switch tabs   |
| Table     | Row/column navigation          | Card view on mobile    |
| Form      | Label associations, validation | Full-width inputs      |
| Button    | Keyboard activation            | Touch targets 44x44px  |

### Page-Specific Accessibility

| Page      | Keyboard Features                  | Mobile Features             |
| --------- | ---------------------------------- | --------------------------- |
| Chat      | Message navigation, quick actions  | Bottom input, swipe actions |
| Battle    | Action shortcuts, turn navigation  | Large touch targets         |
| Inventory | Grid navigation, bulk actions      | Card view, swipe actions    |
| World     | Map navigation, location selection | Pinch zoom, touch map       |
| Settings  | Form navigation, save shortcuts    | Stacked form fields         |

## Acceptance Criteria

- [x] All interactive elements keyboard accessible
- [x] Visible focus indicators on all focusable elements
- [x] Tab order logical and predictable
- [x] Escape closes all modals/popups
- [ ] Screen reader can navigate entire application
- [x] ARIA labels on all interactive elements
- [x] Live regions for dynamic content
- [x] Mobile touch targets 44x44px minimum
- [x] Swipe gestures for common actions
- [ ] Responsive design at all breakpoints
- [x] Reduced motion support
- [x] High contrast mode support
- [x] No keyboard traps
- [x] Skip links for main content

## Implementation Phases

### Phase 1: Core Accessibility ✅ (2026-07-31)

- Focus management system (`src/frontend/alpine/focus.ts`)
- Keyboard navigation (tab order, escape key)
- ARIA labels on interactive elements
- Screen reader support (partial — live regions added)

### Phase 2: Mobile Support 🟡 Partial

- Touch gesture system (`src/frontend/touch.ts` — swipe/tap/long-press)
- Responsive breakpoints (partial)
- Mobile-specific patterns
- Touch target sizing (44px CSS in `app.css`)

### Phase 3: Keyboard Shortcuts

- Shortcut system
- Shortcut editor UI
- Context-specific shortcuts
- Shortcut help overlay

### Phase 4: Advanced Features

- Screen reader optimizations (ARIA live regions done; full navigation pending)
- Keyboard shortcuts for power users

### Phase 5: Testing & Polish

- Accessibility audit
- Mobile testing
- Screen reader testing
- Keyboard-only testing

## Files to Create

- `src/frontend/a11y/focus-manager.ts` — Focus management
- `src/frontend/a11y/keyboard-shortcuts.ts` — Shortcut system
- `src/frontend/a11y/touch-gestures.ts` — Touch gesture system
- `src/frontend/a11y/screen-reader.ts` — Screen reader utils
- `src/frontend/a11y/responsive.ts` — Responsive utilities
- `src/frontend/a11y/a11y.css` — Accessibility styles
- `src/frontend/alpine/a11y.ts` — Alpine.js a11y logic

## Related Epics

- **All UI Epics** — Accessibility applies to all user-facing features
- **Epic Frontend Components** — Shared component accessibility
- **Epic Mobile Support** — Mobile-specific features
