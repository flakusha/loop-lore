<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Ambient Sound System

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Priority:** Medium
**Status:** Done
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

**Resolved:** 2026-10-14 registry-driven close: git issue 464d1ba (registry tip: 80003208d Konstantin Fedotov Auto-closed: appended .md marker marks TASK-AMBIENT-SOUND-SYSTEM done)
