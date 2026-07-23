# EPIC: Immersion & Presentation

**Status:** ⬜ Not Started
**Priority:** Medium
**Plan.md:** §48
**Issue:** `EPIC-048`

## Summary

"Wow"-layer: emotion-reactive portraits, visual novel mode, adaptive soundscape, karaoke TTS, director's Mode (cinematic metadata).

## Tasks

| Task                                 | Files                                      | Effort | Source   | Task File                       |
| ------------------------------------ | ------------------------------------------ | ------ | -------- | ------------------------------- |
| Emotion-reactive portraits           | `src/assets/emotion-portraits.ts` (new)    | Med    | ideas #1 | —                               |
| Visual Novel Mode renderer           | `src/frontend/vn/` (new)                   | Med    | ideas #2 | `TASK-visual-novel-mode.md`     |
| Text Effects & Overlays              | `src/frontend/effects/` (new)              | Med    | —        | `TASK-text-effects-overlays.md` |
| 3D View Modes (consolidated)         | `src/frontend/3d/`, `src/frontend/avatar/` | High   | —        | `TASK-3d-view-modes.md`         |
| Info Bubbles (help tooltips)         | `src/frontend/components/info-bubble.html` | Low    | —        | `TASK-info-bubbles.md`          |
| Adaptive soundscape & music          | `src/generation/soundscape.ts` (new)       | Med    | ideas #3 | —                               |
| Karaoke TTS                          | `src/generation/karaoke-tts.ts` (new)      | High   | ideas #4 | —                               |
| Director's Mode (cinematic metadata) | `src/story/director-mode.ts` (new)         | High   | ideas #5 | —                               |

## Ideas Merged

- `docs/ideas/immersion-presentation.md` — ideas #1 (emotion portraits), #2 (VN mode), #3 (soundscape), #4 (karaoke TTS), #5 (director's Mode)

## Dependencies

- Assets polymorphic system (`docs/spec/assets.md`) for emotion portrait linking
- Sprite asset pipeline + layout component (`docs/frontend/chat/layout.md`) for VN mode
- Audio generation providers + audio player component for soundscape
- TTS provider integration + streaming token events (SSE/WS) for karaoke TTS
- VN Mode (#2) + structured generation metadata for Director's Mode

## Related Tasks

- `TASK-visual-novel-mode.md` — VN mode renderer (Phase 1-6)
- `TASK-text-effects-overlays.md` — text effects + overlay components
- `TASK-3d-view-modes.md` — 3D avatars, GLTF, view modes (supersedes 3 old tasks)
- `TASK-chat-backgrounds-location-sync.md` — backgrounds for VN mode scenes
- `TASK-emotion-intent-detection.md` — emotion triggers for effects + portraits
- `TASK-info-bubbles.md` — reusable help tooltip component for config menus (i18n)

## Linked Tasks

- TASK-immersion-presentation.md
