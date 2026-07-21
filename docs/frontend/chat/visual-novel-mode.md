# Chat: Visual Novel Mode

A chat display mode that renders conversations like a visual novel —
full-screen or large background image with text overlaid or positioned
below, character portraits, and scene transitions. Toggled per-chat.

---

## Overview

Visual Novel (VN) mode transforms the standard chat bubble layout into
a cinematic presentation. Instead of scrolling bubbles, the user sees:

1. A **scene image** (background or character portrait) filling a large
   portion of the screen
2. **Text** rendered as a VN-style dialogue box over or below the image
3. **Character portraits** positioned left/right with expression changes
4. **Scene transitions** between location or context changes

This mode is ideal for story-driven RP, cinematic moments, and
immersive single-character interactions.

---

## Activation

| Method              | Behavior                                          |
| ------------------- | ------------------------------------------------- |
| Chat settings       | Toggle "Visual Novel Mode" in chat configuration  |
| Slash command       | `/vn on` / `/vn off` (future)                     |
| Per-chat default    | Set in character or world settings                |
| Per-message override| Not supported — mode is chat-wide                 |

When activated, the chat area transitions from bubble layout to VN layout.
Message history is preserved — scrolling up shows earlier "scenes."

---

## Layout Modes

### Mode 1: Text Over Image (Overlay)

The image fills the scene area. Text appears in a semi-transparent
dialogue box at the bottom:

```
┌──────────────────────────────────────┐
│                                      │
│         [Background Image]           │
│         (full scene area)            │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ 🗣️ Elara                     │    │  ← character name
│  │ "The forest paths are        │    │
│  │  treacherous at night..."    │    │  ← dialogue text
│  │                        [▼]   │    │  ← advance indicator
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

**Dialogue box:**
- Positioned at bottom of scene area
- Background: `rgba(0, 0, 0, 0.75)` (configurable opacity)
- Border-radius: `--radius-md`
- Padding: `--space-3` horizontal, `--space-2` vertical
- Max-height: 30% of scene area (scrollable if text overflows)
- Character name in accent color above text
- Advance indicator (▼) pulses subtly

### Mode 2: Text Below Image

Image at top, text in a separate panel below (classic VN style):

```
┌──────────────────────────────────────┐
│                                      │
│         [Background Image]           │
│         (top 60% of scene area)      │
│                                      │
├──────────────────────────────────────┤
│ 🗣️ Elara                            │  ← character name
│ "The forest paths are treacherous   │
│  at night. We should find shelter   │
│  before the shadows grow long..."   │
│                              [▼]    │
└──────────────────────────────────────┘
```

**Text panel:**
- Background: `--bg-primary` (solid, not transparent)
- Takes remaining 40% of scene area
- Full markdown rendering (same as bubble mode)
- Scrollable for long responses

### Mode 3: Split View

Side-by-side: portrait on left, text on right:

```
┌──────────────────────────────────────┐
│ ┌──────────┐  ┌───────────────────┐  │
│ │          │  │ 🗣️ Elara          │  │
│ │Character │  │                   │  │
│ │Portrait  │  │ "The forest       │  │
│ │          │  │  paths are..."    │  │
│ │          │  │                   │  │
│ └──────────┘  │            [▼]   │  │
│               └───────────────────┘  │
└──────────────────────────────────────┘
```

**Split ratios:** configurable (default 40:60 portrait:text).

---

## Image Scaling

Background and portrait images scale to fit the scene area:

| Scale Mode | Behavior                                    | Best for                    |
| ---------- | ------------------------------------------- | --------------------------- |
| `contain`  | Fit within area, letterbox if needed        | Preserve aspect ratio       |
| `cover`    | Fill area, crop overflow                    | Cinematic backgrounds       |
| `fill`     | Stretch to fill (distort if needed)         | Rarely used                 |
| `auto`     | `cover` for backgrounds, `contain` for portraits | Default                |

**User preference:** stored in chat settings, default `auto`.

**Transition:** when scaling mode changes, animate with 200ms ease.

---

## Character Portraits

When a character speaks, their portrait appears (modes 2 and 3):

**Positioning:**
- Left side for character messages (default)
- Right side for user messages (if user avatar configured)
- Center for system/narration messages (no portrait, text centered)

**Portrait source:** character's `avatar_url` asset. For 3D avatars
(see `TASK-3d-view-modes.md`), the 3D render replaces the static image.

**Expression changes:** if emotion detection is active (see
`TASK-emotion-intent-detection.md`), the portrait swaps to match the
detected emotion. Fallback: use the base avatar for all messages.

**Portrait size:** 30-40% of scene width (configurable). Minimum 200px.

---

## Scene Transitions

When the background changes (location change, new scene, time skip):

| Transition | Visual                                  | Duration |
| ---------- | --------------------------------------- | -------- |
| `fade`     | Crossfade old → new                     | 400ms    |
| `cut`      | Instant swap                            | 0ms      |
| `dissolve` | Pixelated dissolve                      | 600ms    |
| `slide`    | New image slides in from right          | 300ms    |
| `wipe`     | Horizontal wipe reveal                  | 400ms    |

**Default:** `fade`. Configurable per-chat or per-world.

**Trigger points:**
- Location change (section divider in sectioned chats)
- Time-of-day change (if world has time system)
- Explicit user action (`/scene <location>` command)
- LLM narration of scene change (detected by keyword: "arrives at", "enters", etc.)

---

## Text Rendering

### Dialogue Box Content

The dialogue box renders the **latest message** (or user-selected message
if navigating history). Content includes:

- **Speaker name** (character name or "Narrator" for system messages)
- **Dialogue text** (full markdown rendering)
- **Thinking process** (collapsed, click to expand — same as bubble mode)
- **Attachments** (inline images scaled to fit, audio/video as player embeds)

### Typewriter Effect (Optional)

When enabled, text reveals character-by-character:

- Speed: configurable (default 30ms per character)
- Click or space → instant reveal of remaining text
- Pause on punctuation (100ms for `,`, 200ms for `.!?`)
- Disabled for system/narration messages (appear instantly)
- `prefers-reduced-motion` → disabled automatically

### Text Styling

Per-message text styling based on message role:

| Role        | Style                                         |
| ----------- | --------------------------------------------- |
| Character   | `--text-primary`, normal weight                |
| User        | `--text-primary`, slightly dimmer              |
| Narrator    | `--text-secondary`, italic                     |
| System      | `--text-tertiary`, small, centered             |

---

## Navigation

### Scene History

Users can navigate between scenes (previous/next background + dialogue):

| Control     | Action                                      |
| ----------- | ------------------------------------------- |
| `←` / `→`  | Previous/next message (with background)     |
| `Space`     | Advance to next message (typewriter: reveal) |
| `Click`     | Same as Space                               |
| Scroll up   | View previous scenes (backgrounds change)   |
| Scene map   | Mini-map of scenes (future, optional)       |

### Auto-Advance

Optional timer-based auto-advance:

- Default: off
- When on: advances to next message after N seconds (configurable)
- Pauses on user interaction (scroll, click)
- Resumes after 3s of inactivity

---

## Settings

Per-chat VN mode settings (stored in chat record or localStorage):

```typescript
interface VnModeSettings {
  enabled: boolean;
  layout: "overlay" | "below" | "split";
  imageScaling: "contain" | "cover" | "fill" | "auto";
  transition: "fade" | "cut" | "dissolve" | "slide" | "wipe";
  typewriter: boolean;
  typewriterSpeed: number;     // ms per character
  autoAdvance: boolean;
  autoAdvanceDelay: number;    // seconds
  dialogueBoxOpacity: number;  // 0-1 (overlay mode)
  portraitSize: number;        // percentage of scene width
  splitRatio: number;          // portrait:text ratio (e.g. 40)
}
```

---

## Integration Points

- **Chat layout** (`docs/frontend/chat/layout.md`): VN mode replaces the
  bubble message list with the scene renderer
- **Chat backgrounds** (`TASK-chat-backgrounds-location-sync.md`):
  VN mode uses location-linked backgrounds
- **3D avatars** (`TASK-3d-view-modes.md`): 3D rendered portraits in
  VN mode instead of static images
- **Emotion detection** (`TASK-emotion-intent-detection.md`):
  expression-matched portraits
- **Section transitions** (`TASK-chat-sectioning-multi-location.md`):
  scene transitions on location changes
- **Audio/soundscape** (`epic-immersion-presentation.md`):
  ambient audio tied to scenes

## Files

### Create

- `src/frontend/vn/scene-renderer.ts` — VN mode scene manager
- `src/frontend/vn/dialogue-box.ts` — dialogue text renderer
- `src/frontend/vn/transition-engine.ts` — scene transitions
- `src/frontend/vn/portrait-manager.ts` — character portrait positioning
- `src/frontend/vn/typewriter.ts` — typewriter text effect
- `src/frontend/vn/settings.ts` — VN mode preferences
- `src/frontend/vn/styles.css` — VN mode styles

### Modify

- `src/views/chat.html` — VN mode container, toggle
- `src/frontend/alpine/chat.ts` — VN mode state binding
- `src/routes/chats.ts` — VN mode settings CRUD
- `src/db/migrations/` — vn_mode_settings column on chats table

## Performance

| Metric            | Target  | Notes                         |
| ----------------- | ------- | ----------------------------- |
| Scene transition  | < 400ms | Preload next image            |
| Image load        | < 500ms | WebP/AVIF, lazy load          |
| Typewriter FPS    | 30+     | requestAnimationFrame          |
| Memory (images)   | < 100MB | Current + 2 preloaded scenes  |

## Risk

Medium — significant frontend rendering work, but leverages existing
asset system and chat infrastructure. No schema changes required beyond
settings storage.

## Related

- `epic-immersion-presentation.md` — VN mode is task #2 in this epic
- `TASK-visual-novel-mode.md` — implementation task
- `TASK-chat-backgrounds-location-sync.md` — background source
- `TASK-3d-view-modes.md` — 3D portrait integration
