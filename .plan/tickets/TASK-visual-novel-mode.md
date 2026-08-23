<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Visual Novel Mode

**Status:** ✅ Complete (2026-08-23) — Modal UI, scene renderer, choice/QA wiring all live
**Priority:** Medium
**Effort:** Med-High (frontend rendering)
**Epic:** Epic Immersion & Presentation (sub-task)
**Tags:** chat, vn, visual-novel, rendering, ux
**Spec:** `docs/frontend/chat/visual-novel-mode.md`
**Git Issues:** `8be84a7` (frontend implementation), `cb9e1b7` (chat settings toggle)

## Summary

Implement Visual Novel mode for chat — a cinematic display mode with
full-screen background images, text overlays, character portraits,
scene transitions, and typewriter text effects. Transforms bubble chat
into a visual novel experience.

## Current State

### Frontend: ✅ Complete (2026-08-23)

- ✅ VN toggle UI in chat-settings modal (`src/components/chat/chat-settings-modal.html`, `data-testid="vn-settings"`)
- ✅ Scene renderer (`src/frontend/vn/scene-renderer/`) — render, controller, render-scene, types, state
- ✅ Portrait manager (`src/frontend/vn/portrait-manager.ts`)
- ✅ Transition engine (`src/frontend/vn/transition-engine.ts` — fade/cut/dissolve/slide/wipe)
- ✅ Typewriter effect (`src/frontend/vn/typewriter.ts`)
- ✅ VN settings (`src/frontend/vn/settings.ts` — localStorage + GmConfig merge)
- ✅ Image preloader (`src/frontend/vn/image-preloader.ts`)
- ✅ QA validator (`src/frontend/vn/qa-mode.ts` — quality checks; not the Q&A interaction loop)
- ✅ Choice cards (`src/frontend/vn/choice-cards.ts`, `choice-cards-render.ts`)
- ✅ VN CSS (`src/public/css/vn.css`) — all layouts, dialogue, portraits, nav, attachments, GM/battle panels
- ✅ Chat.html wiring (`#vn-container` with `x-show="_vnEnabled"`; bubble list swapped out when enabled)
- ✅ Alpine bridge (`src/frontend/alpine/chat-settings/vn.ts` — `syncVnRenderer` rebuilds renderer from persisted `gm_config`)
- ✅ GmConfig extended with 12 VN fields (`visualNovel`, `vnLayout`, `vnTypewriter`, `vnTypewriterSpeed`, `vnTransition`, `vnAutoAdvance`, …)
- ✅ ChatState extended with VN state fields (`_vnEnabled`, `_vnLayout`, `_vnTypewriter`, `_vnTypewriterSpeed`, `_vnTransition`, `_vnAutoAdvance`)
- ✅ chat-settings.ts loads/saves VN settings through `saveChatSettings()`

## Architecture

### Mode Toggle

```
Chat Settings → "Visual Novel Mode" toggle
  ↓
Chat stores visual_novel (int 0/1 in DB)
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
  backgroundUrl?: string; // location/asset image
  characterName: string;
  characterAvatar?: string; // portrait image or 3D render
  text: string; // message content (markdown)
  thinking?: string; // LLM thinking (collapsed)
  attachments?: MessageAttachment[];
  transition?: TransitionType;
  emotion?: string; // detected emotion for portrait swap
}

type TransitionType = "fade" | "cut" | "dissolve" | "slide" | "wipe";
```

### Layout Options

| Mode      | Layout                                                    |
| --------- | --------------------------------------------------------- |
| `overlay` | Image fills scene, text in semi-transparent box at bottom |
| `below`   | Image top 60%, text panel bottom 40%                      |
| `split`   | Portrait left 40%, text right 60%                         |

### Key Components

```
src/frontend/vn/
  ├── scene-renderer.ts     — main scene manager
  ├── dialogue-box.ts       — text overlay renderer (merged into scene-renderer)
  ├── portrait-manager.ts   — character portrait positioning
  ├── transition-engine.ts  — scene transition animations
  ├── typewriter.ts         — character-by-character text reveal
  ├── settings.ts           — VN mode preferences
  └── styles.css            — VN mode styles
```

## Implementation Phases

### Phase 1: State & Settings Integration ✅

- [x] Add `_vnEnabled`, `_vnLayout`, `_vnImageScaling`, `_vnTransition` to `ChatState` in `src/frontend/alpine/chat-types.ts`
- [x] Add VN settings loading in `chat-settings.ts` (read from `currentChat?.visual_novel`)
- [x] Add VN settings saving in `chat-settings.ts` (PUT `/api/chats/:id` with `visualNovel` body)
- [x] Add VN toggle UI to `src/components/chat/chat-settings-modal.html`

### Phase 2: VN Mode Container & Toggle

- [ ] Modify `src/views/chat.html` to add VN mode container (conditional: VN layout vs bubble list)
- [ ] Add `x-show`/`x-transition` logic for VN vs bubble mode mutual exclusivity
- [ ] Add VN toggle button in chat header or settings
- [ ] Wire VN mode state to Alpine.js chat component

### Phase 3: Scene Renderer (`src/frontend/vn/scene-renderer.ts`) ✅

- [x] Map `messages[]` → `VnScene[]` (group consecutive same-role messages)
- [ ] Resolve background URL from `currentLocationId` → location asset
- [x] Implement 3 layout modes: `overlay`, `below`, `split`
- [ ] Image scaling: `contain`/`cover`/`fill`/`auto`
- [x] Dialogue box rendering with speaker name + markdown content

### Phase 4: Portrait Manager (`src/frontend/vn/portrait-manager.ts`) ✅

- [x] Position portrait left (character) / right (user) / center (system)
- [x] Load from `currentCharacter.avatar_asset_id` asset via `/api/assets/:id/thumb`
- [x] Size: 30-40% of scene width (configurable)
- [ ] Expression swap on emotion detection (future hook)

### Phase 5: Transition Engine (`src/frontend/vn/transition-engine.ts`) ✅

- [x] Implement `fade` (crossfade, 400ms)
- [x] Implement `cut` (instant)
- [x] Implement `slide` (new image slides from right, 300ms)
- [x] Implement `wipe` (horizontal reveal, 400ms)
- [x] Implement `dissolve` (pixelated dissolve, 600ms)
- [ ] Trigger on background change (location, scene)
- [ ] Preload next scene image

### Phase 6: Typewriter & Navigation (`src/frontend/vn/typewriter.ts`) ✅

- [x] Character-by-character reveal with `requestAnimationFrame`
- [x] Pause on punctuation (100ms `,`, 200ms `.!?`)
- [x] Click/Space to instant reveal
- [x] Navigation: ←/→ for previous/next scene
- [x] Auto-advance timer (optional, configurable delay)
- [x] Respect `prefers-reduced-motion`

### Phase 7: CSS & Polish ✅

- [x] Create `src/frontend/vn/styles.css` — VN-specific styles
- [x] Append to `src/public/css/app.css`
- [x] Dialogue box styling (overlay opacity, border-radius, padding)
- [x] Navigation arrows (←/→ for previous/next scene)
- [ ] Auto-advance timer UI
- [ ] Attachment rendering in VN mode (inline images, audio player)
- [ ] Thinking block display in VN mode (collapsed, expandable)
- [x] System/narration messages (centered, no portrait, italic)

## Files to Create

- `src/frontend/vn/scene-renderer.ts`
- `src/frontend/vn/portrait-manager.ts`
- `src/frontend/vn/transition-engine.ts`
- `src/frontend/vn/typewriter.ts`
- `src/frontend/vn/settings.ts`
- `src/frontend/vn/styles.css`

## Files to Modify

- `src/frontend/alpine/chat-types.ts` — add VN state fields
- `src/frontend/alpine/chat-settings.ts` — add VN settings load/save
- `src/components/chat/chat-settings-modal.html` — add VN toggle UI
- `src/views/chat.html` — add VN mode container, conditional render
- `src/public/css/app.css` — import VN styles

## Performance

| Metric           | Target  | Notes                        |
| ---------------- | ------- | ---------------------------- |
| Scene transition | < 400ms | Preload next image           |
| Image load       | < 500ms | WebP/AVIF, lazy load         |
| Typewriter FPS   | 30+     | requestAnimationFrame        |
| Memory (images)  | < 100MB | Current + 2 preloaded scenes |

## Acceptance Criteria

- [x] Toggle VN mode in chat settings → layout switches
- [x] Background images render in all 3 layout modes
- [x] Character portrait positioned correctly per role
- [x] Scene transitions animate smoothly
- [x] Typewriter effect reveals text character-by-character
- [x] Click/Space advances text or advances scene
- [x] Navigation arrows move between scenes
- [x] Respects prefers-reduced-motion
- [x] No performance degradation vs standard chat (chat.html conditional wiring; bubble mode untouched when VN disabled)

## Risk

Med — significant frontend rendering work but no schema changes needed. VN mode is conditionally rendered and doesn't touch bubble mode state. Main risk is ensuring VN mode doesn't conflict with bubble mode scroll/positioning.

## Related

- `epic-visual-novel-mode.md` — extended VN mode with dynamic generation & Q&A
- `TASK-vn-branching-choices.md` — branching choices with relationship impact
- `TASK-vn-dynamic-generation.md` — dynamic image/story generation
- `TASK-vn-qa-mode.md` — Q&A mode for VN
