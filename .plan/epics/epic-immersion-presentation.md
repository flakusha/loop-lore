<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Immersion & Presentation

**Effort:** Medium
**Type:** epic
**Tags:** immersion, presentation, visual-novel, portraits, text-effects, 3d, soundscape, tts, director-mode
**Overview:** The "wow"-layer epic: emotion-reactive portraits, VN mode, text effects, 3D views, backgrounds, adaptive audio, karaoke TTS, and director's mode. Tracks the presentation surface only — heavy renderers stay as linked tasks/epics and are NOT built here.

**Status:** In Progress
**Status Note:** VN renderer, branching choices, dynamic generation, Q&A mode, emotion detection, and multi-avatar selection have shipped; text-fx core landed; 3D, soundscape, karaoke TTS, director's mode, info bubbles remain open.
**Priority:** Medium
**Plan.md:** §48
**Issue:** `EPIC-048`

## Summary

"Wow"-layer: emotion-reactive portraits, visual novel mode, adaptive soundscape, karaoke TTS, director's Mode (cinematic metadata).

## Tasks

| Task | Files | Effort | Status | Task File |
| ---- | ----- | ------ | ------ | --------- |
| Emotion-reactive portraits | multi-avatar selection (shipped) | Med | ✅ Done — superseded by `TASK-character-multi-avatar.md` (Done) + `TASK-emotion-intent-detection.md` (Done); no `src/assets/emotion-portraits.ts` needed | — |
| Visual Novel Mode renderer | `src/frontend/vn/` | Med | ✅ Done — `TASK-visual-novel-mode.md` Done (2026-08-23); see `epic-visual-novel-mode.md` | `TASK-visual-novel-mode.md` |
| VN branching + dynamic gen + Q&A | `src/frontend/vn/` | Med | 🟡 Partial — owned by `epic-visual-novel-mode.md`, which carries the open ACs: choice cards are never mounted, the Q&A interaction loop has no code, and all image generation is deferred to `epic-comfyui-plugin`. Reconciled 2026-10-09; the prior `✅ Done — all Done` row did not match `src/` | — |
| Text Effects & Overlays | `src/frontend/effects/text-fx.ts` (landed: shake/glow/typewriter/fade) | Med | 🟡 Partial — core helper shipped; overlay components (status bars, badges) open in `TASK-text-effects-overlays.md` (Not Started) | `TASK-text-effects-overlays.md` |
| 3D View Modes (consolidated) | `src/frontend/3d/` (does not exist — no 3D code shipped) | High | ⬜ Open — deferred, `TASK-3d-view-modes.md` umbrella Not Started | `TASK-3d-view-modes.md` |
| Chat backgrounds + location sync | — (no implementation) | Med–High | ⬜ Open — deferred, `TASK-chat-backgrounds-location-sync.md` Not Started | `TASK-chat-backgrounds-location-sync.md` |
| Info Bubbles (help tooltips) | `src/frontend/alpine/info-bubble.ts` (does not exist) | Low | ⬜ Open — deferred in-epic (see below); `TASK-info-bubbles.md` Not Started | `TASK-info-bubbles.md` |
| Adaptive soundscape & music | `src/generation/soundscape.ts` (does not exist) | Med | ⬜ Open — deferred to `epic-ambient-music-sfx.md` / `epic-audio-video-sound.md` | — |
| Karaoke TTS | `src/generation/karaoke-tts.ts` (does not exist) | High | ⬜ Open — deferred to `epic-tts-foundation.md` / `epic-audio-video-sound.md` | — |
| Director's Mode (cinematic metadata) | `src/story/director-mode.ts` (does not exist) | High | ⬜ Open — deferred, no task file yet | — |

## Ideas Merged

- `docs/ideas/immersion-presentation.md` — ideas #1 (emotion portraits), #2 (VN mode), #3 (soundscape), #4 (karaoke TTS), #5 (director's Mode)

## Dependencies

- Assets polymorphic system (`docs/spec/assets.md`) for emotion portrait linking
- Sprite asset pipeline + layout component (`docs/frontend/chat/layout.md`) for VN mode
- Audio generation providers + audio player component for soundscape
- TTS provider integration + streaming token events (SSE/WS) for karaoke TTS
- VN Mode (#2) + structured generation metadata for Director's Mode

## Related Epics

- `epic-visual-novel-mode.md` (In Progress) — owns all VN rendering, branching, dynamic generation, and Q&A. This epic's VN rows mirror that epic's state rather than being a second source of truth: the renderer row is Done, the branching/Q&A/dynamic-gen row is Partial with its open ACs carried by `epic-visual-novel-mode.md` (reconciled 2026-10-09 — this line previously claimed every VN row was Done).
- `epic-wardrobe-avatar-variants.md` (Not Started) — `visual = f(emotion, wardrobe, context)`; extends the shipped multi-avatar/emotion selection this epic's portrait row relied on.
- `epic-avatar-alpha-vn-layering.md` (Not Started) — RGBA sprites + matting fallback so VN portraits composite without halos; consumes `FEAT-background.md`.
- `epic-audio-video-sound.md` (Not Started) + `epic-ambient-music-sfx.md` + `epic-tts-foundation.md` (all Not Started) — own the soundscape and karaoke-TTS rows; no audio code is built here.
- `epic-frontend-emoji-reactions.md` (In Progress) — reactions picker/popover patterns that text-effects and info-bubble popovers MUST reuse (positioning, Escape/click-away, reduced-motion).

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Multi-avatar selection (`TASK-character-multi-avatar.md`, Done) + emotion detection (`TASK-emotion-intent-detection.md`, Done) | Emotion → avatar resolution | Portrait row fulfilled without a new asset module |
| VN renderer (`src/frontend/vn/`, Done) | Scene/choice/Q&A rendering | Branching, dynamic-gen, Q&A rows fulfilled |
| Text-fx core (`src/frontend/effects/text-fx.ts`: shake/glow/typewriter/fade) | CSS-class effect lifecycle + reduced-motion guard | Foundation for overlay/effect work; emotion-hook triggers reuse it |
| i18n `t()` + locale catalogs | Help-text resolution (`<scope>.<field>.help`) | Info-bubble text (Layer 1 application interface) |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Wardrobe epic | Emotion-axis selection contract | Adds outfit axis on top |
| Alpha/VN-layering epic | VN sprite stage | Prefers matted cut-outs once matting lands |
| Ambient/TTS epics | VN scene + emotion context | Drive soundscape and karaoke timing (future) |

### Deferred Gaps (NOT built in this pass)

- **Info bubbles** (Low, `TASK-info-bubbles.md` Not Started): no `info-bubble` component exists (`src/frontend/alpine/info-bubble.ts`, `src/frontend/components/info-bubble.html` both absent); existing popovers (seen-state, reaction picker, slash autocomplete) are message-scoped, not a reusable help-tooltip primitive. Deferred — needs a dedicated implementation pass reusing the emoji-reactions popover/Escape/reduced-motion pattern plus i18n `<scope>.<field>.help` keys. All other Low-effort rows are already Done; VN/3D/karaoke rows stay as tasks per scope.
- **3D, soundscape, karaoke TTS, director's mode**: no code exists (`src/frontend/3d/`, `src/generation/soundscape.ts`, `src/generation/karaoke-tts.ts`, `src/story/director-mode.ts` all absent); each is High/Med effort owned by its epic/task and explicitly out of scope here.

## Related Tasks

- `TASK-visual-novel-mode.md` — VN mode renderer ✅ Done
- `TASK-text-effects-overlays.md` — text effects + overlay components (core helper landed, overlays open)
- `TASK-3d-view-modes.md` — 3D avatars, GLTF, view modes (Not Started, deferred)
- `TASK-chat-backgrounds-location-sync.md` — backgrounds for VN mode scenes (Not Started, deferred)
- `TASK-emotion-intent-detection.md` — emotion triggers for effects + portraits ✅ Done
- `TASK-info-bubbles.md` — reusable help tooltip component for config menus (i18n) (Not Started, deferred in-epic)
- `TASK-vn-branching-choices.md` — VN branching choices, relationship impact ✅ Done
- `TASK-vn-dynamic-generation.md` — dynamic image/story generation ✅ Done
- `TASK-vn-qa-mode.md` — Q&A mode for VN ✅ Done

## Linked Tasks

- TASK-immersion-presentation.md
- TASK-vn-dynamic-generation.md
- TASK-vn-qa-mode.md
