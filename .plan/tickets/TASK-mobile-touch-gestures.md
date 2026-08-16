<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Mobile Touch Gestures

**Status:** 🟡 In Progress
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-accessibility-input

## Summary

Implement mobile touch gesture system with swipe, tap, long-press, and pinch gestures. Ensure touch targets are 44x44px minimum for WCAG 2.5.8 compliance.

## Acceptance Criteria

- [x] Touch targets 44x44px minimum
- [x] Swipe left/right for actions
- [x] Long press for context menu
- [ ] Pull-to-refresh on lists
- [ ] Pinch zoom on maps/images
- [ ] Haptic feedback for actions
- [ ] Gesture conflict resolution
- [x] Fallback for devices without touch

## Implementation Details

### Touch Gesture System

```typescript
// src/frontend/a11y/touch-gestures.ts
export interface TouchGesture {
  id: string;
  type: "tap" | "swipe" | "pinch" | "long-press";
  direction?: "left" | "right" | "up" | "down";
  action: () => void;
  threshold: number; // pixels
  timeout: number; // ms for long-press
}

export class TouchGestureManager {
  private gestures: Map<string, TouchGesture> = new Map();
  private startX: number = 0;
  private startY: number = number;
  private startTime: number = 0;

  // Register gesture
  register(gesture: TouchGesture,): void {
    this.gestures.set(gesture.id, gesture,);
  }

  // Handle touch start
  handleTouchStart(e: TouchEvent,): void {
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
    this.startTime = Date.now();
  }

  // Handle touch end
  handleTouchEnd(e: TouchEvent,): void {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const duration = Date.now() - this.startTime;

    const dx = endX - this.startX;
    const dy = endY - this.startY;
    const distance = Math.sqrt(dx * dx + dy * dy,);

    // Detect gesture
    if (distance < 10 && duration < 300) {
      // Tap
      this.triggerGesture("tap",);
    } else if (distance > 50 && duration < 500) {
      // Swipe
      const direction = this.getSwipeDirection(dx, dy,);
      this.triggerGesture(`swipe-${direction}`,);
    } else if (duration > 500 && distance < 10) {
      // Long press
      this.triggerGesture("long-press",);
    }
  }

  // Get swipe direction
  private getSwipeDirection(dx: number, dy: number,): string {
    if (Math.abs(dx,) > Math.abs(dy,)) {
      return dx > 0 ? "right" : "left";
    } else {
      return dy > 0 ? "down" : "up";
    }
  }
}
```

### Touch Target Sizing

```css
/* Ensure minimum touch target size */
button, a, input, select, textarea, [role="button"] {
  min-height: 44px;
  min-width: 44px;
}

/* Mobile-specific sizing */
@media (max-width: 768px) {
  button, a, input, select, textarea, [role="button"] {
    min-height: 48px;
    min-width: 48px;
  }

  /* Increase padding for touch */
  .touch-target {
    padding: 12px 16px;
  }
}
```

### Swipe Actions

```html
<!-- Swipeable list item -->
<div class="swipe-container" data-swipe-left="delete" data-swipe-right="archive">
  <div class="swipe-content">
    <!-- Item content -->
  </div>
  <div class="swipe-action-left">
    <span class="icon">🗑️</span> Delete
  </div>
  <div class="swipe-action-right">
    <span class="icon">📦</span> Archive
  </div>
</div>
```

### Haptic Feedback

```typescript
// Trigger haptic feedback
export function hapticFeedback(type: "light" | "medium" | "heavy",): void {
  if ("vibrate" in navigator) {
    switch (type) {
      case "light":
        navigator.vibrate(10,);
        break;
      case "medium":
        navigator.vibrate(20,);
        break;
      case "heavy":
        navigator.vibrate(40,);
        break;
    }
  }
}
```

## Files to Create

- `src/frontend/a11y/touch-gestures.ts`
- `src/frontend/a11y/touch-targets.css`
- `src/frontend/a11y/haptic.ts`

## Related Tasks

- TASK-keyboard-navigation.md
- TASK-screen-reader-support.md
- TASK-responsive-design.md
