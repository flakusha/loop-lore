# Epic 2026-26: Avatar & Expression System

**Status:** Not Started (P2)
**Priority:** Medium
**Source:** .plan/tickets/TASK-3d-character-avatars.md

## Summary

3D character avatars with emotion detection and expression mapping.

## Linked Tasks

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| FEAT-2026-020 | Device Tier Gating Implementation | Medium | Not Started |
| FEAT-2026-021 | E2E Performance Benchmarks | Medium | Not Started |
| FEAT-2026-022 | Edge Cases Deep Dive | Medium | Not Started |
| TASK-3d-character-avatars.md | 3D Character Avatars | Low | Not Started |
| TASK-emotions-avatar-edit-model.md | Emotions Avatar Edit Model | Medium | Not Started |
| TASK-dynamic-avatars-dota-style.md | Dynamic Avatars Dota Style | Medium | Not Started |
| TASK-emotion-intent-detection.md | Emotion Intent Detection | Medium | Not Started |

## Implementation Plan

### Phase 1: 3D Foundation
- [ ] Add Three.js dependency
- [ ] Create avatar scene manager
- [ ] Create VRM loader
- [ ] Create expression controller

### Phase 2: Expression System
- [ ] Implement emotion-to-blend-shape mapping
- [ ] Add emotion detection from text
- [ ] Add avatar preview in editor

### Phase 3: Integration
- [ ] Wire 3D avatar into chat messages
- [ ] Add model upload endpoint
- [ ] Add model viewer component

### Phase 4: Optimization
- [ ] Model caching
- [ ] LOD implementation
- [ ] Idle animations

## Files

- `src/frontend/3d/avatar-scene.ts` — Three.js scene
- `src/frontend/3d/vrm-loader.ts` — VRM loader
- `src/frontend/3d/expression-controller.ts` — Expression mapper
- `src/frontend/3d/avatar-renderer.ts` — Canvas renderer
- `src/characters/emotion-detection.ts` — Emotion from text
- `src/views/character-editor.html` — 3D preview
- `src/views/chat.html` — Avatar in messages
- `package.json` — Three.js deps
