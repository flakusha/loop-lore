# TASK: Visual Novel Mode

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med
**Epic:** Epic Immersion & Presentation (sub-task)
**Tags:** chat, vn, visual-novel, rendering, ux
**Spec:** `docs/frontend/chat/visual-novel-mode.md`

## Summary

Implement Visual Novel mode for chat — a cinematic display mode with
full-screen background images, text overlays, character portraits,
scene transitions, and typewriter text effects. Transforms bubble chat
into a visual novel experience.

## Rationale

- Visual novel presentation is the #1 requested immersion feature
- Existing chat backgrounds (TASK-chat-backgrounds-location-sync) provide
  images but no VN-style text rendering
- Leverages existing asset system, character avatars, and location data
- Per-chat toggle means no disruption to standard chat users

## Current State

- Standard bubble chat layout is complete (P0 + P1)
- Chat backgrounds task exists but not started
- 3D avatar task exists but not started
- No scene rendering infrastructure
- No VN mode code exists

## Architecture

### Mode Toggle

```
Chat Settings → "Visual Novel Mode" toggle
  ↓
Chat stores vn_mode_enabled (boolean)
  ↓
On chat load: if enabled, render VN layout instead of bubbles
  ↓
Message history preserved — scroll through "scenes"
```

### Scene Model

Each "scene" = one message (or group of consecutive messages from same
sender) + associated background image:

```typescript
interface VnScene {
  messageId: string;
  backgroundUrl?: string;     // location/asset image
  characterName: string;
  characterAvatar?: string;   // portrait image or 3D render
  text: string;               // message content (markdown)
  thinking?: string;          // LLM thinking (collapsed)
  attachments?: MessageAttachment[];
  transition?: TransitionType;
  emotion?: string;           // detected emotion for portrait swap
}

type TransitionType = "fade" | "cut" | "dissolve" | "slide" | "wipe";
```

### Layout Options

| Mode      | Layout                                         |
| --------- | ---------------------------------------------- |
| `overlay` | Image fills scene, text in semi-transparent box at bottom |
| `below`   | Image top 60%, text panel bottom 40%           |
| `split`   | Portrait left 40%, text right 60%              |

### Key Components

```
src/frontend/vn/
  ├── scene-renderer.ts     — main scene manager
  ├── dialogue-box.ts       — text overlay renderer
  ├── portrait-manager.ts   — character portrait positioning
  ├── transition-engine.ts  — scene transition animations
  ├── typewriter.ts         — character-by-character text reveal
  ├── settings.ts           — VN mode preferences
  └── styles.css            — VN mode styles
```

## Tasks

### Phase 1: Core Renderer

- [ ] Create `src/frontend/vn/scene-renderer.ts` — scene lifecycle
- [ ] Implement image background rendering (contain/cover/fill/auto)
- [ ] Implement dialogue box overlay (semi-transparent, positioned)
- [ ] Implement "below" layout mode
- [ ] Implement "split" layout mode
- [ ] Wire to chat message list (map messages → scenes)

### Phase 2: Character Portraits

- [ ] Create `src/frontend/vn/portrait-manager.ts`
- [ ] Position portrait left for character, right for user
- [ ] Size: 30-40% of scene width (configurable)
- [ ] Load from character `avatar_url` asset
- [ ] Expression swap on emotion detection (if available)

### Phase 3: Transitions

- [ ] Create `src/frontend/vn/transition-engine.ts`
- [ ] Implement fade (crossfade, 400ms)
- [ ] Implement cut (instant)
- [ ] Implement slide (new image slides from right, 300ms)
- [ ] Implement wipe (horizontal reveal, 400ms)
- [ ] Trigger on background change (location, scene)

### Phase 4: Typewriter & Navigation

- [ ] Create `src/frontend/vn/typewriter.ts`
- [ ] Character-by-character reveal (configurable speed)
- [ ] Pause on punctuation (100ms comma, 200ms sentence end)
- [ ] Click/Space to reveal remaining text instantly
- [ ] Navigation: ←/→ for previous/next scene
- [ ] Auto-advance timer (optional, configurable delay)
- [ ] Respect `prefers-reduced-motion`

### Phase 5: Settings & Integration

- [ ] Create `src/frontend/vn/settings.ts`
- [ ] Store VN settings per-chat (localStorage or chat record)
- [ ] Add VN mode toggle to chat settings UI
- [ ] Wire to chat.html (conditional render: VN vs bubbles)
- [ ] Wire to chat state (Alpine.js integration)
- [ ] Add schema column for VN settings (if not localStorage)

### Phase 6: Polish

- [ ] Preload next scene image (smooth transitions)
- [ ] Scroll through scene history (backgrounds change)
- [ ] Attachment rendering in VN mode (inline images, audio player)
- [ ] Thinking block display in VN mode (collapsed, expandable)
- [ ] System/narration messages (centered, no portrait, italic)

## Files to Create

- `src/frontend/vn/scene-renderer.ts`
- `src/frontend/vn/dialogue-box.ts`
- `src/frontend/vn/portrait-manager.ts`
- `src/frontend/vn/transition-engine.ts`
- `src/frontend/vn/typewriter.ts`
- `src/frontend/vn/settings.ts`
- `src/frontend/vn/styles.css`

## Files to Modify

- `src/views/chat.html` — VN mode container, conditional render
- `src/frontend/alpine/chat.ts` — VN mode state
- `src/routes/chats.ts` — VN settings CRUD
- `src/db/migrations/` — vn_mode_settings column (if needed)
- `src/public/css/app.css` — VN mode imports

## Performance

| Metric            | Target  | Notes                         |
| ----------------- | ------- | ----------------------------- |
| Scene transition  | < 400ms | Preload next image            |
| Image load        | < 500ms | WebP/AVIF, lazy load          |
| Typewriter FPS    | 30+     | requestAnimationFrame          |
| Memory (images)   | < 100MB | Current + 2 preloaded scenes  |

## Acceptance Criteria

- [ ] Toggle VN mode in chat settings → layout switches
- [ ] Background images render in all 3 layout modes
- [ ] Character portrait positioned correctly per role
- [ ] Scene transitions animate smoothly
- [ ] Typewriter effect reveals text character-by-character
- [ ] Click/Space advances text or advances scene
- [ ] Navigation arrows move between scenes
- [ ] Respects prefers-reduced-motion
- [ ] No performance degradation vs standard chat

## Risk

Med — significant frontend rendering work but no schema changes beyond
settings storage. Leverages existing asset system. Main risk is ensuring
VN mode doesn't conflict with bubble mode state.
