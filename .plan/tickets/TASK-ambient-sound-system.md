<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Ambient Sound System

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-audio-video-sound

## Description

Create a location-based ambient sound system that generates layered background
audio based on scene tags (forest, night, rain, city, etc.).

## Acceptance Criteria

- [ ] Ambient provider interface (`generateAmbient(tags, intensity, duration)`)
- [ ] Location → scene tag mapping (from world/location metadata)
- [ ] Multi-layer audio mixing (ambient + weather + time-of-day)
- [ ] Crossfade between locations on scene change
- [ ] `POST /api/audio/ambient` route
- [ ] Frontend audio player with ambient controls
- [ ] Settings: ambient volume, auto-play, per-location override

## Technical Notes

- Ambient generation can use pre-generated audio library + LLM for composition
- ComfyUI with audio models (Stable Audio Open) for generation
- Audio layers should be mixable with Web Audio API
- Consider caching generated ambient tracks per location
