<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audio Player Component

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Priority:** High
**Status:** Done
**Status Note:** implemented on branch `core-t6-audio` (pending merge to dev) — `src/frontend/alpine/audio-player.ts` (Alpine scope `audioPlayerFactory`), `src/components/audio-player.html` (markup), `src/public/css/components/audio-player.css` (44px touch targets), `src/frontend/alpine/audio-player.test.ts` (16 tests)
**Epic:** epic-audio-video-sound

## Description

Create a reusable audio player component for the frontend that handles TTS
playback, ambient sound, and music with controls for volume, playback speed,
and looping.

## Acceptance Criteria

- [x] `<audio-player>` component (Alpine.js) — `src/frontend/alpine/audio-player.ts` exports the `audioPlayerFactory` scope and registers it on `globalThis`; `src/components/audio-player.html` is the markup (included into a view with `{{> audio-player.html}}`)
- [x] Play/pause/stop controls — `play()` / `pause()` / `stop()` (rewinds) / `toggle()` on the scope, wired to the buttons in the partial
- [x] Volume slider + mute toggle — `setVolume()` (clamped 0..1, remembered in `localStorage` under `loop-lore.audio-player.volume`) + `toggleMute()`
- [x] Playback speed control (0.5x - 2.0x) — `setSpeed()` clamps to 0.5..2 and writes `playbackRate`; `cycleSpeed()` walks the presets 0.5/0.75/1/1.25/1.5/2
- [x] Loop toggle for ambient/music — `toggleLoop()` flips the element's `loop` flag
- [x] Progress bar with seek — range input bound to `duration` / `currentTime`; `seekTo()` clamps to the track length, `nudge()` seeks relatively
- [x] Multiple simultaneous audio tracks (ambient + TTS + music) — one `<audio-player>` element per track; each keeps its own volume/mute/speed/loop state, so several play at once (no shared `AudioContext` mix bus — the ticket's optional advanced mixing stays out of scope)
- [ ] Visual waveform or equalizer display (optional) — deliberately skipped: the AC is optional and the player drives a plain HTML5 `<audio>` element, so there is no analyser node to draw from
- [x] Keyboard shortcuts (space=play/pause, arrows=seek) — `handleKey()` on the focusable root: space toggles playback, arrows seek ±5s
- [x] Mobile-friendly touch controls — `src/public/css/components/audio-player.css` gives every control a 44px minimum touch target

## Evidence

- `src/frontend/alpine/audio-player.ts` — the Alpine scope (`audioPlayerFactory`).
- `src/components/audio-player.html` — the markup partial.
- `src/public/css/components/audio-player.css` — component styles (44px touch targets); linked from `src/views/layout.html`.
- `src/frontend/alpine/audio-player.test.ts` — 16 unit tests covering transport, clamping, volume persistence, speed presets, seeking, keyboard handling and the metadata/ended/error paths.
- Consumers (chat message list, ambient panel) adopt the component in their own tickets; this ticket delivers the component itself.

## Technical Notes

- Use Web Audio API for mixing multiple tracks
- HTML5 Audio element for simple playback
- Consider `AudioContext` for advanced mixing
- Store volume preferences in localStorage
