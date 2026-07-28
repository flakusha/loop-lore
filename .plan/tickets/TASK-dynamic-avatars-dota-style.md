> **Superseded by:** `TASK-3d-view-modes.md` — all content consolidated there.
> Implement from the consolidated task. This file preserved for reference only.

# TASK: Dynamic Avatars — Dota 2 Style Animated Mugshots

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** High
**Epic:** epic-character-core-system
**Related:** TASK-3d-character-avatars, TASK-rigged-model-buffer-render

## Summary

Animated character mugshots inspired by Dota 2 hero portraits — breathing animation, eye movement, expression transitions, ambient effects. Characters feel alive during chat.

## Inspiration

Dota 2 hero portraits:

- Subtle breathing animation (chest/shoulder movement)
- Eye tracking (follows cursor or random movement)
- Expression shifts (idle → alert → combat)
- Ambient particles (fire, frost, magic aura)
- Sound effects on hover/select

## Architecture

### Animation Layers

```
Base Layer (VRM/Spine 2D)
  ├── Idle animation (breathing, blinking)
  ├── Expression layer (blend shapes / morph targets)
  ├── Ambient particles (shader-based)
  └── Audio layer (idle sounds, hover effects)
```

### Animation States

| State    | Description                      | Trigger          |
| -------- | -------------------------------- | ---------------- |
| Idle     | Default breathing, random blinks | Default          |
| Alert    | Eyes widen, slight lean forward  | User typing      |
| Happy    | Smile, head tilt                 | Positive message |
| Sad      | Downturn, slow blink             | Negative message |
| Angry    | Furrowed, intense stare          | Conflict         |
| Speaking | Mouth movement sync              | LLM generating   |

### Tech Stack

| Component | Library                 | Notes                      |
| --------- | ----------------------- | -------------------------- |
| 2D rigged | Spine 2D or DragonBones | Lightweight,广泛 supported |
| 3D rigged | Three.js + VRM          | Full 3D, more complex      |
| Particles | PixiJS or WebGL shaders | Ambient effects            |
| Audio     | Howler.js               | Spatial audio              |

## Tasks

### Phase 1: 2D Spine/DragonBones

- [ ] Evaluate Spine 2D vs DragonBones (licensing, features)
- [ ] Create character rig template (torso, head, eyes, mouth)
- [ ] Implement animation state machine (idle → transitions)
- [ ] Add expression morph targets
- [ ] Create `src/frontend/avatar/` module

### Phase 2: Animation System

- [ ] Implement idle animation loop (breathing, blinking)
- [ ] Add expression transition blending (smooth morph)
- [ ] Implement eye tracking (cursor follow or random)
- [ ] Add ambient particle system (fire, frost, magic)
- [ ] Add audio triggers (hover, select, expression change)

### Phase 3: Chat Integration

- [ ] Wire expression state to chat events:
  - User typing → alert state
  - LLM generating → speaking state
  - Message received → emotion-based expression
- [ ] Add avatar hover effects (glow, particles intensify)
- [ ] Add avatar select animation (zoom, particles burst)

### Phase 4: Performance

- [ ] Implement sprite sheet caching (pre-baked animations)
- [ ] Add LOD (simplified rig for low-end devices)
- [ ] GPU particle optimization
- [ ] Audio pooling and spatial audio

## Files to Create

- `src/frontend/avatar/avatar-machine.ts` — state machine
- `src/frontend/avatar/spine-renderer.ts` — Spine/DragonBones renderer
- `src/frontend/avatar/expression-morph.ts` — expression blending
- `src/frontend/avatar/particle-system.ts` — ambient effects
- `src/frontend/avatar/audio-manager.ts` — spatial audio
- `src/frontend/avatar/styles.css` — avatar container styles

## Files to Modify

- `src/views/chat.html` — avatar container in messages
- `src/frontend/alpine/chat.ts` — emotion state binding
- `src/routes/characters.ts` — rig/animation metadata

## Performance

| Metric         | Target  | Notes                 |
| -------------- | ------- | --------------------- |
| Animation FPS  | 30+     | Idle animation        |
| Memory         | < 100MB | Sprite sheets + audio |
| Load time      | < 2s    | Cached rig files      |
| Particle count | < 50    | Ambient only          |

## Art Requirements

- Character rig template (torso, head, eyes, mouth)
- Expression sprite sheets (happy, sad, angry, surprised, neutral)
- Ambient particle textures (fire, frost, magic)
- Idle audio clips (breathing, ambient sounds)

## Risk

High — significant art pipeline requirements, animation complexity, performance concerns, licensing (Spine).

## Linked Epics

- `epic-character-core-system.md`
