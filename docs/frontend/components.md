# Frontend: Shared Components

Toasts, modals, empty states, spinners, and other reusable UI patterns used across all pages.

---

## Toast Notifications

**Position**: fixed, top-right corner, stack upward.

**Structure**: each toast is a horizontal bar with:

- Left icon (varies by type)
- Message text (flex: 1)
- Close button (×)

**Four variants**:

| Type    | Icon       | Left border                 |
| ------- | ---------- | --------------------------- |
| success | ✓ (green)  | 3px solid `--accent-green`  |
| error   | ✗ (red)    | 3px solid `--accent-red`    |
| info    | ℹ (blue)   | 3px solid `--accent-blue`   |
| warning | ⚠ (yellow) | 3px solid `--accent-yellow` |

**Behavior**:

- Appear with slide-in-from-right animation (200ms ease-out)
- Auto-dismiss after 5 seconds with fade-out animation
- Dismissible by clicking the × button
- Multiple toasts stack vertically, newest on top
- Max 5 visible toasts at once (oldest overflows are dropped)
- Tied to Alpine.js reactive data (`toasts` array in the root app component)

**Dispatched via**: custom DOM event `show-toast` with detail `{ type, message, icon? }`.

---

## Confirmation Dialog

**Structure**: overlay modal with:

- Title (e.g., "Delete message?")
- Message body (describes what will happen)
- Cancel button (secondary style) — dismisses dialog
- Confirm button (danger style for destructive actions, primary for non-destructive)

**Keyboard**: Escape dismisses as Cancel. Enter triggers Confirm.

**Behavior**:

- Modal overlay has `@click.self="close"` (click outside = cancel)
- Confirm dispatches the intended action
- Cancel or Escape or × dismisses without action

---

## Loading Spinner

**Inline variant**: 20px circle, 2px border, `--bg-quaternary` track, `--accent-primary` top border. Used inside buttons during loading states.

**Page-section variant**: 32px circle, 3px border, same colors. Centered in the section area. Used for loading states in gallery grid, character grid, settings forms.

**Animation**: `spin` keyframes (0% → 100% rotation), 0.6s linear, infinite.

---

## Skeleton Shimmer

Used for loading placeholders before content arrives.

**Structure**: a rectangular block with:

- Background: `--bg-tertiary` (`#30333b`)
- Overlay gradient: subtle linear gradient sweep from transparent → semi-transparent white → transparent
- Animation: `shimmer` keyframes (translateX from -100% to 100%), 3s infinite

**Variants by component**:

- **Message skeleton**: left-aligned bubble shape (border-radius 10px, width 60%, height 60px) and two right-aligned (width 40%, height 40px)
- **Card skeleton**: rectangle for image (aspect-ratio 3:4) + two narrow rectangles for text lines
- **Asset skeleton**: rectangle for thumbnail (aspect-ratio 4:3) + narrow rectangle for label
- **Form skeleton**: narrow rectangle for label + wider rectangle for input

---

## Empty States

**Structure**: centered flex column with:

- Large icon (48px, opacity 0.4)
- Title (18px, bold, `--text-secondary`)
- Description (14px, `--text-tertiary`, max-width 300px, centered)
- Action button (optional, primary style)

Used in: zero chats, zero messages, zero characters, zero assets, search-no-results.

---

## Inline Banner

**Structure**: full-width horizontal bar with:

- Colored left border (red for error, blue for info, yellow for warning)
- Icon + message text
- Optional action button ("Retry", "Dismiss")

**Position**: at the top of the relevant content section (above the message list, above the character grid). Does NOT replace the content below it — the banner is inserted above.

**Animation**: slides down from above on appearance, 150ms ease.

---

## Tags / Chips

**Structure**: small inline pill with:

- Background: `--bg-tertiary`
- Text: `--text-secondary`, 12px
- Border-radius: 9999px
- Padding: 2px 8px

**Active variant**: used for selected filters or linked-indicator

- Background: rgba(245, 151, 232, 0.15)
- Text: `--accent-primary`

**Removable variant**: chip with × button. Used in tag inputs and entity selection.

---

## Frontend Logger

A lightweight browser-compatible logger for debugging Alpine.js components and htmx handlers.

### API

```typescript
import { createBrowserLogger, getBrowserLogger } from "../logger";

// Create logger with level and module
const log = createBrowserLogger("debug", "chat");

// Log with structured metadata (async)
await log.info("Message sent", { messageId: "abc123", tokens: 150 });
await log.warn("Generation slow", { elapsedMs: 5000, model: "claude-3-opus" });
await log.error("API failed", { error: err.message, status: 500 });

// Child loggers with inherited bindings
const reqLog = log.child({ requestId: "req_123" });
```

### Log Levels

| Level | Numeric | Console method |
|-------|---------|----------------|
| debug | 0       | console.debug |
| info  | 1       | console.info  |
| warn  | 2       | console.warn  |
| error | 3       | console.error |

### Timestamp Format

Uses ISO 8601 format parseable by `new Date()`:
```
2026-07-04T14:30:00.123+02:00
```

- Milliseconds: 3 digits
- Timezone: Offset from UTC (`+02:00`, `-05:00`, `+00:00`)
- TZ Support: Honors `TZ` environment variable; supports IANA timezone names

### Integration

1. **Development:** Logs appear in browser console with timestamp and module
2. **Production:** Can be disabled via `LOG_LEVEL=error` or sent to server via `fetch()`
3. **Async:** Uses `setImmediate`/`requestIdleCallback` for non-blocking writes

### Usage in Alpine.js Components

```typescript
// In Alpine.js component
window.chatState = function() {
  const log = createBrowserLogger("debug", "chat");
  
  return {
    async sendMessage() {
      await log.debug("Sending message", { content: this.input });
      // ... send logic
      await log.info("Message sent", { id: response.id });
    }
  };
};
```

---

## Drop Zone (for file uploads)

**Structure**:

- 2px dashed border in `--border-default`
- Border-radius: `--radius-md` (10px)
- Padding: 32px 48px (vertical/horizontal)
- Text centered: icon + "Drag & drop files here" + "or click to browse" hint
- Cursor: pointer

**States**:

- Default: dashed gray border, muted colors
- Hover: pink border highlight, subtle background tint
- Drag-over: pink border, stronger background tint
- Has-file: filename shown, "Upload" button appears

---

## Responsive Breakpoints

| Breakpoint | Behavior                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| >1200px    | Full layout: sidebar + chat + optional right panel                                                                      |
| 768–1200px | Right panel overlays instead of pushing (no width crunch)                                                               |
| <768px     | Sidebar collapses to hamburger menu. Full-width chat.                                                                   |
| <480px     | Sidebar hidden entirely. Accessible via hamburger. Message bubbles are full-width (max-width: 100%). Toolbar compacted. |

Mobile sidebar: a slide-out drawer overlaying the chat area, toggled by a hamburger icon in the header. The right panel becomes a bottom sheet instead of side panel.
