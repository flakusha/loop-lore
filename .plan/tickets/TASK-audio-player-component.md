<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audio Player Component

**Priority:** High
**Status:** ⬜ Not Started
**Epic:** epic-audio-video-sound

## Description

Create a reusable audio player component for the frontend that handles TTS
playback, ambient sound, and music with controls for volume, playback speed,
and looping.

## Acceptance Criteria

- [ ] `<audio-player>` component (Alpine.js)
- [ ] Play/pause/stop controls
- [ ] Volume slider + mute toggle
- [ ] Playback speed control (0.5x - 2.0x)
- [ ] Loop toggle for ambient/music
- [ ] Progress bar with seek
- [ ] Multiple simultaneous audio tracks (ambient + TTS + music)
- [ ] Visual waveform or equalizer display (optional)
- [ ] Keyboard shortcuts (space=play/pause, arrows=seek)
- [ ] Mobile-friendly touch controls

## Technical Notes

- Use Web Audio API for mixing multiple tracks
- HTML5 Audio element for simple playback
- Consider `AudioContext` for advanced mixing
- Store volume preferences in localStorage
