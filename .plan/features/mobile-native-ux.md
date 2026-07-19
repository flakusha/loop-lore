# Mobile-Native UX Implementation

## Overview

Mobile-optimized interface with haptics, swipe gestures, and touch-friendly controls.

## Implementation

### File: src/frontend/alpine/mobile-gestures.ts

```typescript
export function useMobileGestures() {
  return {
    // Swipe to reply
    handleSwipe(messageId: string, direction: "left" | "right",) {
      if (direction === "right") {
        this.$dispatch("open-reply", { messageId, },);
      } else if (direction === "left") {
        this.$dispatch("show-actions", { messageId, },);
      }
    },

    // Long press for context menu
    handleLongPress(element: HTMLElement, messageId: string,) {
      if ("vibrate" in navigator) {
        navigator.vibrate(50,); // Haptic feedback
      }
      this.$dispatch("show-context-menu", { messageId, x: element.clientX, y: element.clientY, },);
    },

    // Pull to refresh
    handlePullToRefresh() {
      const startY = 0;
      let currentY = 0;

      return {
        onTouchStart(e: TouchEvent,) {
          startY = e.touches[0].clientY;
        },
        onTouchMove(e: TouchEvent,) {
          currentY = e.touches[0].clientY;
          if (currentY - startY > 100 && window.scrollY === 0) {
            this.$dispatch("refresh-chat",);
          }
        },
      };
    },
  };
}
```

### File: src/public/css/mobile.css

```css
/* Thumb-friendly controls */
.mobile-friendly .message-actions {
  min-height: 44px;
  min-width: 44px;
}

/* Bottom navigation for mobile */
.mobile-nav {
  position: fixed;
  bottom: 0;
  width: 100%;
  height: 60px;
  background: var(--bg-secondary);
  display: flex;
  justify-content: space-around;
  align-items: center;
}

/* Swipe action indicators */
.swipe-indicator {
  position: absolute;
  right: 20px;
  opacity: 0;
  transition: opacity 0.2s;
}

.swipe-left .swipe-indicator.reply {
  opacity: 1;
}
```

### Voice Input Integration

```typescript
// src/frontend/alpine/voice-input.ts
export function useVoiceInput() {
  return {
    isListening: false,
    transcript: "",

    async startListening() {
      if (!("webkitSpeechRecognition" in window)) {
        this.$dispatch("show-toast", { type: "error", message: "Voice input not supported", },);
        return;
      }

      this.isListening = true;
      const recognition = new webkitSpeechRecognition();
      recognition.lang = this.$store.user.settings?.language || "en";
      recognition.interimResults = true;

      recognition.onresult = (e,) => {
        this.transcript = Array.from(e.results,)
          .map((r,) => r[0].transcript)
          .join("",);
      };

      recognition.onend = () => {
        this.isListening = false;
        this.$dispatch("send-message", { content: this.transcript, },);
      };

      recognition.start();
    },
  };
}
```

## Edge Cases

- Voice recognition not supported → fallback to text
- Haptic API unavailable → silent fail
- Touch events on desktop → ignore (use mouse)
- Small screen → hide sidebar, show hamburger
- Slow device → reduce animation complexity
- Voice in noisy environment → show "Try again" toast

## Device Detection

```typescript
// src/frontend/alpine/device.ts
export function getDeviceType(): "mobile" | "tablet" | "desktop" {
  const width = window.innerWidth;
  if (width < 768) { return "mobile"; }
  if (width < 1024) { return "tablet"; }
  return "desktop";
}

// Apply different interaction models
if (getDeviceType() === "mobile") {
  document.body.classList.add("mobile",);
}
```

## Configuration

```yaml
mobile:
  haptics_enabled: true
  swipe_actions: true
  voice_input: true
  thumb_controls: true
  reduced_animations: auto # true on battery low
```
