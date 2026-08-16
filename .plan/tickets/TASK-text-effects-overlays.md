<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Text Effects & Overlays

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Med
**Epic:** Epic Immersion & Presentation (sub-task)
**Tags:** chat, text-effects, overlays, decoration, ux, css
**Spec:** `docs/frontend/chat/text-effects-overlays.md`

## Summary

CSS-based text effects (typewriter, glow, fade-in, emotion-triggered
animations) and overlay components (status bars, condition icons,
location badges, time badges) for chat messages. Adds atmosphere
and information density without breaking immersion.

## Rationale

- Text effects make messages feel alive (typewriter for VN mode, glow
  for magic, shake for anger)
- Overlays provide RPG context (HP bar, condition icons) without cluttering
  the message text itself
- Decoration (border accents, background tints) helps visually distinguish
  speakers and scene types
- All CSS-based = lightweight, no JS animation loops

## Current State

- Message bubbles render with basic styling
- Thinking blocks use `<details>` expand
- System messages have italic styling
- No text animation effects
- No overlay components
- No message decoration beyond role-based colors

## Architecture

### Effect System

All effects are CSS-only (no JS animation loops):

| Effect      | CSS Property            | Use Case                    |
| ----------- | ----------------------- | --------------------------- |
| Typewriter  | `@keyframes` + width    | VN mode text reveal         |
| Glow        | `text-shadow`           | Magic, emphasis             |
| Fade-in     | `opacity` transition    | Message appear              |
| Color tint  | `color`                 | Speaker/emotion distinction |
| Shake       | `transform: translateX` | Impact, surprise            |
| Pulse       | `transform: scale`      | Important message           |
| Blur reveal | `filter: blur`          | Dreamlike, flashback        |
| Wave        | `transform: translateY` | Magic, dreamlike            |

### Overlay System

Lightweight DOM elements positioned relative to message bubbles:

| Overlay         | Position         | Data Source              |
| --------------- | ---------------- | ------------------------ |
| Status bar      | Above message    | RPG stats (HP, MP, etc.) |
| Condition icons | Right of text    | Auto-detected or GM-set  |
| Location badge  | Section boundary | Chat section location    |
| Time badge      | Bottom-right     | In-world or real time    |

### Decoration System

Visual styling applied to the entire message bubble:

| Decoration      | Visual                        | Trigger               |
| --------------- | ----------------------------- | --------------------- |
| Border accent   | Colored left border (4px)     | Speaker identity      |
| Background tint | Subtle background color shift | Emotion / scene type  |
| Glow ring       | Outer glow around bubble      | Important / critical  |
| Dim             | Reduced opacity (0.6)         | Flashback / memory    |
| Highlight       | Yellow background (20%)       | Search match / pinned |

### Emotion → Effect Mapping

| Emotion   | Effect                  | CSS                      |
| --------- | ----------------------- | ------------------------ |
| Angry     | Shake (subtle)          | `translateX` oscillation |
| Surprised | Pulse                   | `scale(1.02)`            |
| Scared    | Wave                    | `translateY` sinusoidal  |
| Happy     | Glow (warm color)       | `text-shadow` amber      |
| Sad       | Fade-in (slower, 400ms) | `opacity` transition     |
| Magic     | Rainbow (brief, 1s)     | `background-clip` anim   |

### Performance

- All effects: CSS `@keyframes` or `transition` (compositor-driven)
- No `requestAnimationFrame` loops for text effects
- `prefers-reduced-motion` → all effects disabled via media query
- Overlays: lightweight `<span>` elements, no heavy DOM

## Tasks

### Phase 1: Text Effects Engine

- [ ] Create `src/frontend/effects/text-effects.ts` — effect registry
- [ ] Implement typewriter effect (CSS `@keyframes` width animation)
- [ ] Implement glow effect (`text-shadow` with color parameter)
- [ ] Implement fade-in effect (`opacity` transition on appear)
- [ ] Implement shake effect (`translateX` oscillation)
- [ ] Implement pulse effect (`scale` transition)
- [ ] Add `prefers-reduced-motion` check (disable all effects)
- [ ] Create effect CSS classes in `src/frontend/effects/styles.css`

### Phase 2: Emotion-Triggered Effects

- [ ] Create emotion → effect mapping configuration
- [ ] Wire to emotion detection output (if available)
- [ ] Apply effect class to message bubble based on emotion
- [ ] Fallback: no effects if emotion detection disabled
- [ ] Add max effects per message cap (default 3)

### Phase 3: Overlay Components

- [ ] Create `src/frontend/effects/overlays.ts` — overlay renderer
- [ ] Implement status bar overlay (HP, MP, conditions from RPG data)
- [ ] Implement condition icons overlay (auto-detected from content)
- [ ] Implement location badge (section boundary, click for info)
- [ ] Implement time badge (in-world or real timestamp)
- [ ] Add `aria-label` for screen reader accessibility

### Phase 4: Message Decoration

- [ ] Create `src/frontend/effects/decorations.ts` — decoration renderer
- [ ] Implement border accent (unique color per character)
- [ ] Implement background tint (scene-type based)
- [ ] Implement glow ring (important messages)
- [ ] Implement dim (flashback/memory messages)
- [ ] Implement highlight (search match, pinned messages)
- [ ] Wire decoration to message render pipeline

### Phase 5: Settings & Integration

- [ ] Create `src/frontend/effects/settings.ts` — effect preferences
- [ ] Add settings UI (Settings → Chat → Text Effects)
- [ ] Per-chat toggle for effects, overlays, decorations
- [ ] Global enable/disable for each category
- [ ] Performance mode: disable all effects and overlays
- [ ] Store settings in localStorage

### Phase 6: Plugin Extension Points

- [ ] Register effect plugin interface in `src/plugins/registry.ts`
- [ ] Register overlay plugin interface
- [ ] Plugin priority system (lower = applied first)
- [ ] Plugin condition function (show/hide per message)

## Files to Create

- `src/frontend/effects/text-effects.ts` — effect registry + renderer
- `src/frontend/effects/overlays.ts` — overlay components
- `src/frontend/effects/decorations.ts` — message decoration
- `src/frontend/effects/styles.css` — all effect and overlay styles
- `src/frontend/effects/settings.ts` — effect preferences

## Files to Modify

- `src/views/chat.html` — overlay containers, effect class hooks
- `src/frontend/alpine/chat.ts` — effect state, overlay rendering
- `src/routes/settings.ts` — effect settings API
- `src/public/css/app.css` — import effects styles
- `src/plugins/registry.ts` — plugin interface registration
- `src/db/migrations/` — overlay settings column (if not localStorage)

## Performance

| Metric          | Target | Notes                        |
| --------------- | ------ | ---------------------------- |
| Effect render   | < 16ms | CSS-only, no JS animation    |
| Overlay render  | < 10ms | Lightweight DOM elements     |
| Memory overhead | < 5MB  | CSS classes, no heavy assets |
| Reduced motion  | 0ms    | All effects skipped          |

## Acceptance Criteria

- [ ] Typewriter effect renders text character-by-character
- [ ] Glow effect applies colored text-shadow
- [ ] Emotion-triggered effects work (angry → shake)
- [ ] Status bar shows above messages (when RPG active)
- [ ] Condition icons appear on relevant messages
- [ ] Location badge shows at section boundaries
- [ ] Border accent colors are unique per character
- [ ] Background tints apply based on scene type
- [ ] All effects respect prefers-reduced-motion
- [ ] Settings toggle works for each category
- [ ] No performance degradation vs uneffected chat
- [ ] Plugin interface allows custom effects

## Risk

Low — CSS-based effects are lightweight and well-understood. Overlay
components are small DOM additions. Main risk is visual clutter if too
many effects are enabled simultaneously (mitigated by `maxEffectsPerMessage`).
