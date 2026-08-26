<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Narration Pipeline

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** narration, tts, sfx, ambient, playback, sounding
**Parent Epic:** Audio, Video & Sound Generation (epic-audio-video-sound.md)

## Overview

Full narration pipeline: read text aloud with character voice, emotion, and
ambient sound backing. "Sounding" = TTS + ambient + SFX mixed together
(Phase 6 of the parent epic).

## Sub-Epic of

Part of the **Audio, Video & Sound Generation** mega-epic. See parent epic for
full scope and slicing rationale.

## Scope

- Narration marker detection and message segmentation (speech / action / description)
- Character voice mapping with emotion → voice parameters
- Ambient backing tracks mixed under narration with scene-transition crossfades
- Timestamped SFX insertion from action markers
- Karaoke-style synchronized playback controller
- Composite narration asset storage, caching, and version tracking

## Key Integrations

- TTS Foundation (`epic-tts-foundation.md`): voice presets + synthesis — **hard dependency**
- Ambient, Music & SFX (`epic-ambient-music-sfx.md`): ambient backing + SFX library — **hard dependency**
- Characters: per-character voice preset and emotion mapping
- Locations/Worlds: auto-select ambient from location/scene tags

## Tasks

### Phase 6 — Narration & Sounding

- [ ] Narration pipeline
  - Detect narration markers in messages (`*action*`, `"dialogue"`, `narrator:`)
  - Split into segments: speech (TTS), action (SFX), description (ambient)
  - Generate each segment with appropriate provider
  - Mix into single audio track with proper timing
- [ ] Character voice mapping
  - Per-character voice preset (provider + voice_id + speed + pitch)
  - Emotion detection from text (LLM or regex on narration markers)
  - Map emotion → voice parameters (whisper, shout, laugh, cry)
- [ ] Ambient backing tracks
  - Auto-select ambient based on location/scene tags
  - Mix at lower volume under narration
  - Crossfade on scene transitions
- [ ] SFX insertion
  - Detect action verbs → inject SFX at correct timestamp
  - `*draws sword*` → metallic unsheathe SFX
  - `*door creaks open*` → creak SFX
  - `*fire crackles*` → fire ambience
- [ ] Narration playback controller
  - Synchronized text highlighting (karaoke mode)
  - Pause/resume/seek across mixed tracks
  - Speed control (0.5x - 2.0x)
  - Per-layer volume (voice/ambient/SFX)
- [ ] Narration asset storage
  - Store generated narration as composite asset
  - Link to message + character + location
  - Cache for replay (avoid re-generation)
  - Version tracking (regenerate with different settings)

## Dependencies

- Parent hub: Audio, Video & Sound Generation (`epic-audio-video-sound.md`)
- Sibling: TTS Foundation (`epic-tts-foundation.md`) — required (voice synthesis)
- Sibling: Ambient, Music & SFX (`epic-ambient-music-sfx.md`) — required (backing + SFX)
- Existing: `src/assets/` (composite asset storage + linking)

## Linked Tasks

- TASK-narration-pipeline.md
