<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Ambient, Music & Sound Effects

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** audio, ambient, music, sfx, atmosphere, generation
**Parent Epic:** Audio, Video & Sound Generation (epic-audio-video-sound.md)

## Overview

One coherent scene-audio domain: location-based ambient sound, scene-aware
music generation, and event-driven sound effects — layered, mixed, and
crossfaded into a single atmosphere per scene (Phases 2–3 of the parent epic).

## Sub-Epic of

Part of the **Audio, Video & Sound Generation** mega-epic. See parent epic for
full scope and slicing rationale.

## Scope

- Ambient sound provider interface and location-based generation (scene tags → audio)
- Layered audio mixing with crossfade between locations
- Music generation via stable-audio-open or ComfyUI; scene-aware selection
- SFX trigger detection, library, generation (Bark/ComfyUI), spatial positioning
- `POST /api/audio/ambient` and `POST /api/audio/music` routes

## Design

### Ambient Sound System

```typescript
interface AmbientRequest {
  location_id?: string;
  scene_tags: string[]; // ['forest', 'night', 'rain']
  intensity: number; // 0.0 - 1.0
  duration_ms: number;
}

interface AmbientTrack {
  layers: AudioLayer[]; // multiple overlapping sounds
  fade_in_ms: number;
  fade_out_ms: number;
}

interface AudioLayer {
  type: "ambient" | "music" | "sfx";
  source: string; // URL or generation prompt
  volume: number;
  loop: boolean;
}
```

## Key Integrations

- Locations/Worlds: ambient selection from location scene tags
- TTS Foundation (`epic-tts-foundation.md`): shares audio settings (volume,
  auto-play, mixing) and the audio player component
- Narration Pipeline (`epic-narration-pipeline.md`): consumes ambient backing
  and SFX insertion at timestamps

## Tasks

### Ambient & Music (Phase 2)

- [ ] Ambient sound provider interface
- [ ] Location-based ambient generation (scene tags → audio)
- [ ] Layered audio mixing (multiple ambient tracks)
- [ ] Crossfade between locations
- [ ] Music generation via stable-audio-open or ComfyUI
- [ ] Scene-aware music selection (combat → intense, rest → calm)
- [ ] `POST /api/audio/ambient` route
- [ ] `POST /api/audio/music` route
- [ ] Audio settings in chat (volume, auto-play, mixing)

### Sound Effects (Phase 3)

- [ ] SFX trigger detection (message contains action verbs)
- [ ] SFX library (pre-generated common sounds)
- [ ] SFX generation via Bark or ComfyUI
- [ ] Event-driven SFX (door open, combat hit, spell cast)
- [ ] SFX volume + spatial positioning

## Dependencies

- Parent hub: Audio, Video & Sound Generation (`epic-audio-video-sound.md`)
- Sibling: TTS Foundation (`epic-tts-foundation.md`) — shared player/settings infra
- Existing: `src/generation/providers/comfyui.ts` (ComfyUI audio workflows)
- Existing: `src/assets/` (asset storage + linking)

## Files (proposed)

- `src/generation/audio/` — audio generation pipeline
- `src/generation/audio/ambient.ts` — ambient sound system
- `src/generation/audio/music.ts` — music generation
- `src/generation/audio/sfx.ts` — sound effects
- `src/routes/audio.ts` — audio API routes

## Linked Tasks

- TASK-ambient-sound-system.md
