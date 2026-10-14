<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Ambient, Music & Sound Effects

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Phase 2 ambient core shipped (2026-10-14): provider registry, ComfyUI audio extraction, scene-tag layer mixing, ambient route + template apply seam (TASK-ambient-sound-system, Done). Remaining: music routes / scene-aware selection (Phase 2 tail) and the whole Phase 3 SFX surface.
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** audio, ambient, music, sfx, atmosphere, generation
**Parent Epic:** Audio, Video & Sound Generation (epic-audio-video-sound.md)

## Overview

One coherent scene-audio domain: location-based ambient sound, scene-aware
music generation, and event-driven sound effects — layered, mixed, and
crossfaded into a single atmosphere per scene (Phases 2–3 of the parent epic).

## Current State (verified 2026-10-14)

| Area | Where | State |
| --- | --- | --- |
| Audio prompt templates + profiles | `src/generation/audio-prompt-templates.ts`, `src/generation/audio-prompt-profiles.ts` | Built (FEAT-065-SUB-AUDIO, Done) - subtypes `tts`/`sfx`/`music`/`voice-clone`, families stable-audio / musicgen / riffusion / elevenlabs / bark |
| Audio template CRUD + render preview | `src/routes/templates/modality.ts`, `src/generation/template-service.ts` | Built - `POST /api/templates/audio` creates audio-modality templates |
| Audio generation dispatch | `POST /api/v1/templates/audio/:id/apply` (`src/routes/templates/modality.ts`) | Wired for audio - renders the template body into scene tags and dispatches to the ambient pipeline; video still 501 (no video provider) |
| Ambient generation core | `src/generation/audio/` | Built - provider registry (`types.ts`/`engine.ts`), local procedural provider, scene-tag layer planner + WAV codec + mixer (`ambient.ts`, `wav.ts`) |
| ComfyUI audio support | `src/generation/providers/comfyui.ts`, `src/generation/audio/providers/comfyui.ts` | Built - client extracts `audio`/`gifs` outputs and downloads them (`waitForFiles`, `runWorkflowFiles`); workflow name from config becomes the provider id |
| Ambient route | `POST /api/v1/generation/audio/ambient` (`src/generation/audio-gen-route.ts`) | Built - auth + chat-access scoped, stores the track as an `audio` asset, links chat/message, returns the asset URL |
| `/sfx`, `/music` assistant commands | `src/assistant/commands/sfx.ts`, `music.ts` | Registered `available: false` stubs (BUG-advertised-sfx-music-video-commands-are-stubs, Done - de-advertised, not implemented) |
| External chat music links (NOT this epic) | `src/routes/music-links.ts` + FE music-links panel | Built - embedding user-supplied media links; unrelated to audio generation |
| Voice notes (NOT this epic) | `src/routes/messages/helpers.ts` | Playback metadata only (`label: "voice-note"`, duration) |

Boundary: this epic is **generation** (synthesizing ambient/music/SFX audio). Linking
and playing back existing media is the separate chat-music-linking / voice-notes
surface and must not be conflated with it.

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

- Locations/Worlds: ambient selection from location scene tags (consume existing
  location metadata; a location-to-tags mapping ticket is separate)
- TTS Foundation (`epic-tts-foundation.md`): shares audio settings (volume,
  auto-play, mixing) and the audio player component. Not a hard blocker for this
  epic - ambient/music/SFX shippable on their own; shared settings land with the
  player ticket
- Narration Pipeline (`epic-narration-pipeline.md`): consumes ambient backing
  and SFX insertion at timestamps - depends on this epic, not vice versa

## Tasks

### Ambient & Music (Phase 2)

- [x] Audio prompt templates + profiles for all audio subtypes - shipped with
      FEAT-065-SUB-AUDIO (`src/generation/audio-prompt-{templates,profiles}.ts`)
- [x] Ambient sound provider interface + registry - `src/generation/audio/types.ts`
      (register/resolve) + `engine.ts` (config-driven: `local` + `comfyui:<workflow>`)
- [x] ComfyUI/Stable-Audio provider + audio output extraction in the ComfyUI client -
      `src/generation/providers/comfyui.ts` now reads terminal `audio`/`gifs` outputs
- [x] Location-based ambient generation (scene tags -> layered track) - `ambient.ts`
      `buildAmbientLayers`/`generateAmbient`
- [x] Layered audio mixing (multiple ambient tracks, per-layer gain) - `wav.ts`
      `mixLayers` with per-layer gain + clamp
- [x] Crossfade between locations (fade tails on the mixed track) - per-layer
      `fadeInSec`/`fadeOutSec` (1.5s) in the mix; location-change tails come free
- [ ] Music generation via stable-audio-open or ComfyUI
- [ ] Scene-aware music selection (combat -> intense, rest -> calm)
- [x] Ambient route - real path `POST /api/v1/generation/audio/ambient`
      (`src/generation/audio-gen-route.ts`)
- [ ] `POST /api/v1/generation/audio/music` route
- [x] Wire `POST /api/v1/templates/audio/:id/apply` to the dispatch (drops the 501 for audio)
- [ ] Audio settings in chat (volume, auto-play, mixing) - needs a settings column,
      file separately

### Sound Effects (Phase 3)

- [ ] SFX trigger detection (message contains action verbs)
- [ ] SFX library (pre-generated common sounds)
- [ ] SFX generation via Bark or ComfyUI
- [ ] Event-driven SFX (door open, combat hit, spell cast)
- [ ] SFX volume + spatial positioning

## Dependencies

- Parent hub: Audio, Video & Sound Generation (`epic-audio-video-sound.md`)
- Sibling: TTS Foundation (`epic-tts-foundation.md`) - shared player/settings infra,
  not a blocker for Phases 2-3
- Existing: `src/generation/providers/comfyui.ts` - ComfyUI client (already reads
  terminal `audio`/`gifs` outputs and downloads them)
- Existing: `src/assets/` (asset storage + linking - `createAsset` with `assetType: audio`)

## Files

Built:

- `src/generation/audio/types.ts` + `engine.ts` - provider registry / resolution
- `src/generation/audio/ambient.ts` - ambient layer planner + generate
- `src/generation/audio/wav.ts` - WAV codec + layer mixer
- `src/generation/audio/providers/` - local procedural + ComfyUI providers
- `src/generation/audio-gen-route.ts` - `POST /api/v1/generation/audio/ambient`
- `src/routes/templates/modality.ts` - audio `apply` seam (video still 501)

Still to build:

- `src/generation/audio/music.ts` - music generation
- `src/generation/audio/sfx.ts` - sound effects

## Linked Tasks

- TASK-ambient-sound-system.md - ambient core (Done)
