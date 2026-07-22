# Chat: Text Effects & Overlays

Visual enhancements for chat messages: text styling effects, overlay
components (status bars, condition icons, location badges), and message
decoration options. Adds atmosphere and information density without
breaking immersion.

---

## Overview

Text effects and overlays are visual layers that enhance message
presentation without altering content. They are:

- **Optional** — disabled by default, opt-in per-chat or per-world
- **Non-blocking** — never prevent message interaction
- **Performance-aware** — CSS-based where possible, WebGL only when needed
- **Plugin-extensible** — custom effects can be registered

---

## Text Effects

### Effect Types

| Effect      | Description                                   | Implementation   |
| ----------- | --------------------------------------------- | ---------------- |
| Typewriter  | Character-by-character reveal                 | CSS animation    |
| Glow        | Soft colored glow around text                 | `text-shadow`    |
| Fade-in     | Opacity transition on message appear          | CSS `opacity`    |
| Color tint  | Text color shift based on speaker/emotion     | CSS `color`      |
| Shake       | Brief horizontal shake (impact, surprise)     | CSS `transform`  |
| Pulse       | Scale pulse (emphasis, important message)     | CSS `transform`  |
| Blur reveal | Text starts blurred, sharpens on focus        | CSS `filter`     |
| Wave        | Sinusoidal vertical offset (dreamlike, magic) | CSS `transform`  |
| Rainbow     | Animated color cycle (rare, special moments)  | CSS `background` |

### Per-Role Effects

Default effect assignments by message role:

| Role      | Default Effect   | Trigger         |
| --------- | ---------------- | --------------- |
| Character | Fade-in          | Message appears |
| User      | None             | —               |
| Narrator  | Fade-in + italic | Message appears |
| System    | None             | Always instant  |

**Emotion-triggered effects** (when emotion detection is active):

| Emotion   | Effect                  |
| --------- | ----------------------- |
| Angry     | Shake (subtle)          |
| Surprised | Pulse                   |
| Scared    | Wave                    |
| Happy     | Glow (warm color)       |
| Sad       | Fade-in (slower, 400ms) |
| Magic     | Rainbow (brief, 1s)     |

### Effect Configuration

Per-chat settings:

```typescript
interface TextEffectSettings {
  enabled: boolean;
  typewriter: boolean;
  typewriterSpeed: number; // ms per char (20-100, default 30)
  emotionEffects: boolean; // auto-apply based on detected emotion
  globalEffects: string[]; // enabled effect types
  reducedMotion: boolean; // respect prefers-reduced-motion
}
```

### Performance

All text effects are CSS-only (no JS animation loops):

- `text-shadow` for glow
- `@keyframes` for typewriter, shake, pulse, wave
- `transition` for fade-in, blur
- `prefers-reduced-motion` media query disables all effects automatically

---

## Message Overlays

Overlay components render **on top of or adjacent to** message bubbles
to show supplementary information.

### Overlay Types

#### 1. Status Bar

A thin bar above or below a message showing character status:

```
┌──────────────────────────────────┐
│ ❤️ HP: 45/100  ⚔️ ATK: 12  🛡️ DEF: 8 │  ← status bar
├──────────────────────────────────┤
│ [message bubble]                 │
└──────────────────────────────────┘
```

- Shows: HP, MP, status effects, buffs/debuffs
- Position: top of message (above bubble)
- Style: compact, semi-transparent, small font (11px)
- Only shown on character messages (not user)
- Only when RPG mechanics are active for the chat

#### 2. Condition Icons

Small icons indicating message context:

```
[message bubble] 🗡️ 💀 ✨     ← condition icons
```

| Icon | Meaning                  |
| ---- | ------------------------ |
| 🗡️    | Combat context           |
| 💀   | Danger / death threat    |
| ✨   | Magic / supernatural     |
| 🌙   | Nighttime / dark setting |
| 🔥   | Fire / intense emotion   |
| 💕   | Romance / affection      |
| ⚠️    | Warning / tension        |
| 🎵   | Music / sound reference  |

- Position: right side of message, after text
- Size: 14px, slightly transparent
- Maximum 3 icons per message (most relevant first)
- Auto-detected from message content or set by GM

#### 3. Location Badge

Shows the current location context for a message:

```
┌─ 📍 Dark Forest ──────────────────┐
│ [message bubble]                   │
└───────────────────────────────────┘
```

- Appears at section boundaries (location changes)
- Also shown on hover/focus for any message
- Style: pill-shaped badge, `--bg-secondary` background
- Click: opens location info panel

#### 4. Time Badge

Shows in-world or real-world timestamp:

```
[message bubble]
                🕐 3rd Age, Year 200 — Night   ← time badge
```

- Position: bottom-right of message
- Format: in-world time (if world has time system) or real timestamp
- Style: small, `--text-tertiary` color

---

## Message Decoration

Visual styling applied to the entire message bubble based on context.

### Decoration Types

| Decoration      | Visual                          | Trigger                  |
| --------------- | ------------------------------- | ------------------------ |
| Border accent   | Colored left border (4px)       | Speaker identity         |
| Background tint | Subtle background color shift   | Emotion / scene type     |
| Glow ring       | Outer glow around bubble        | Important / critical msg |
| Dim             | Reduced opacity (0.6)           | Flashback / memory       |
| Highlight       | Yellow background (20% opacity) | Search match / pinned    |

### Border Accent Colors

Each character gets a unique border color (derived from their avatar
or configurable):

| Character | Border Color | Notes         |
| --------- | ------------ | ------------- |
| Elara     | `#7c3aed`    | Purple        |
| Marcus    | `#2563eb`    | Blue          |
| Narrator  | `#6b7280`    | Gray          |
| System    | none         | No border     |
| User      | `#f597e8`    | Pink (accent) |

### Background Tint Mapping

| Scene Type | Tint Color        | Opacity |
| ---------- | ----------------- | ------- |
| Combat     | `--accent-red`    | 5%      |
| Romance    | `--accent-pink`   | 5%      |
| Mystery    | `--accent-purple` | 5%      |
| Peaceful   | `--accent-green`  | 5%      |
| Horror     | `--accent-dark`   | 8%      |
| Default    | none              | 0%      |

**Detection:** keyword-based (simple) or LLM-classified (future).

---

## Settings

Global text effects & overlay settings (in Settings → Chat):

```typescript
interface OverlaySettings {
  // Text effects
  textEffectsEnabled: boolean;
  emotionEffects: boolean;
  typewriterDefault: boolean;

  // Overlays
  statusBarEnabled: boolean; // RPG status above messages
  conditionIconsEnabled: boolean; // auto-detected icons
  locationBadgeEnabled: boolean; // location context
  timeBadgeEnabled: boolean; // timestamp display

  // Decoration
  borderAccentsEnabled: boolean; // colored left borders
  backgroundTintsEnabled: boolean; // scene-type background tints
  dimFlashbacksEnabled: boolean; // dimmed flashback messages

  // Performance
  reducedMotion: boolean; // respect system preference
  maxEffectsPerMessage: number; // cap effect count (default 3)
}
```

---

## Plugin Extension Points

Custom text effects and overlays can be registered via the plugin system:

```typescript
interface TextEffectPlugin {
  id: string;
  name: string;
  render: (message: Message, context: ChatContext,) => HTMLElement | null;
  priority: number; // lower = applied first
}

interface OverlayPlugin {
  id: string;
  name: string;
  position: "above" | "below" | "left" | "right";
  render: (message: Message, context: ChatContext,) => HTMLElement | null;
  condition: (message: Message, context: ChatContext,) => boolean;
}
```

Registration: `src/plugins/registry.ts` (existing plugin infrastructure).

---

## Accessibility

- All effects respect `prefers-reduced-motion` (CSS media query)
- Overlays use `aria-label` for screen readers
- Condition icons have text fallbacks on hover
- Status bars use `role="status"` for live region updates
- High-contrast mode: effects disabled, overlays use solid borders

## Integration Points

- **Message rendering** (`docs/frontend/chat/message-bubbles.md`):
  effects and overlays wrap message bubbles
- **Emotion detection** (`TASK-emotion-intent-detection.md`):
  triggers emotion-based effects
- **RPG mechanics** (`docs/spec/rpg-mechanics.md`):
  status bar data source
- **Plugin system** (`docs/spec/plugin-system.md`):
  custom effect registration
- **VN mode** (`docs/frontend/chat/visual-novel-mode.md`):
  some effects adapt in VN mode (e.g., typewriter is default there)
- **3D avatars** (`TASK-3d-view-modes.md`):
  overlay position adjusts for 3D panel

## Files

### Create

- `src/frontend/effects/text-effects.ts` — effect renderer
- `src/frontend/effects/overlays.ts` — overlay components
- `src/frontend/effects/decorations.ts` — message decoration
- `src/frontend/effects/styles.css` — effect and overlay styles
- `src/frontend/effects/settings.ts` — effect preferences

### Modify

- `src/views/chat.html` — overlay containers, effect hooks
- `src/frontend/alpine/chat.ts` — effect state, overlay rendering
- `src/routes/settings.ts` — effect settings API
- `src/public/css/app.css` — base overlay styles
- `src/db/migrations/` — overlay settings column (if not localStorage)

## Performance

| Metric          | Target | Notes                        |
| --------------- | ------ | ---------------------------- |
| Effect render   | < 16ms | CSS-only, no JS animation    |
| Overlay render  | < 10ms | Lightweight DOM elements     |
| Memory overhead | < 5MB  | CSS classes, no heavy assets |
| Reduced motion  | 0ms    | All effects skipped          |

## Risk

Low — CSS-based effects are lightweight and well-understood. Overlay
components are small DOM additions. Main risk is visual clutter if too
many effects are enabled simultaneously (mitigated by `maxEffectsPerMessage`).

## Related

- `TASK-text-effects-overlays.md` — implementation task
- `TASK-emotion-intent-detection.md` — emotion detection for effects
- `TASK-3d-view-modes.md` — 3D panel overlay positioning
- `epic-immersion-presentation.md` — related immersion features
- `docs/frontend/chat/visual-novel-mode.md` — VN mode uses some effects
