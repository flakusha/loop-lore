# EPIC: Audio, Video & Sound Generation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Type:** Feature Epic
**Tags:** audio, video, sound, tts, music, ambient, atmosphere, generation

## Overview

Add atmospheric audio/video generation to enhance chat immersion. This epic
covers:

1. **Text-to-Speech (TTS)** — per-character voice synthesis with emotion/tone control
2. **Ambient sound generation** — location-based background audio (rain, forest, city)
3. **Music generation** — scene-appropriate background music (tense, calm, combat)
4. **Sound effects** — event-driven SFX (door creak, sword clash, spell cast)
5. **Video generation** — scene animation from narration (future, via Wan/LTX models)

## Current State

| Area             | File                                | State     | Notes                       |
| ---------------- | ----------------------------------- | --------- | --------------------------- |
| Image generation | `src/generation/image-gen-route.ts` | ✅ Built  | sd-server + ComfyUI         |
| Audio in assets  | `src/db/enums-content.ts`           | 🟡 Schema | `audio` MIME type exists    |
| Video in assets  | `src/db/enums-content.ts`           | 🟡 Schema | `video` MIME type exists    |
| TTS provider     | —                                   | ❌        | No TTS integration          |
| Ambient sound    | —                                   | ❌        | No ambient system           |
| Music generation | —                                   | ❌        | No music system             |
| SFX system       | —                                   | ❌        | No sound effects            |
| Video generation | —                                   | ❌        | No video pipeline           |
| Audio player UI  | —                                   | ❌        | No audio playback component |

## Design

### Audio Generation Pipeline

```
Trigger (message/narration/event)
→ Intent detection (what kind of audio?)
→ Provider selection (TTS/ambient/music/SFX)
→ Generation (local API or cloud)
→ Asset storage (link to chat/message/location)
→ Frontend playback (audio element + controls)
```

### TTS System

```typescript
interface TTSRequest {
  text: string;
  character_id?: string; // voice preset
  emotion?: string; // happy, sad, angry, whisper
  speed?: number; // 0.5 - 2.0
  provider: "local" | "elevenlabs" | "openai" | "edge-tts";
}

interface TTSResult {
  audio_url: string;
  duration_ms: number;
  transcript?: string;
}
```

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

### Provider Options

| Provider          | Type        | Cost | Quality  | Latency |
| ----------------- | ----------- | ---- | -------- | ------- |
| Edge-TTS (local)  | TTS         | Free | Good     | Low     |
| ElevenLabs        | TTS         | $    | High     | Med     |
| OpenAI TTS        | TTS         | $    | High     | Med     |
| stable-audio-open | Music/SFX   | Free | Good     | High    |
| Bark (local)      | TTS+SFX     | Free | Medium   | High    |
| ComfyUI Audio     | Music/SFX   | Free | Variable | High    |
| Wan 2.1/2.2       | Video       | Free | Good     | High    |
| LTX-2.3           | Video+Audio | Free | High     | High    |

## Tasks

### Phase 1 — TTS Foundation

- [ ] TTS provider interface (`src/generation/providers/tts.ts`)
- [ ] Edge-TTS integration (free, local, no API key)
- [ ] OpenAI TTS integration (paid, high quality)
- [ ] Per-character voice presets (stored in character settings)
- [ ] Emotion/tone parameter mapping
- [ ] Audio asset creation + linking to messages
- [ ] `POST /api/tts/synthesize` route
- [ ] Frontend audio player component (`src/components/audio-player.html`)
- [ ] Auto-play TTS on message receive (opt-in setting)
- [ ] Unit tests for TTS provider

### Phase 2 — Ambient & Music

- [ ] Ambient sound provider interface
- [ ] Location-based ambient generation (scene tags → audio)
- [ ] Layered audio mixing (multiple ambient tracks)
- [ ] Crossfade between locations
- [ ] Music generation via stable-audio-open or ComfyUI
- [ ] Scene-aware music selection (combat → intense, rest → calm)
- [ ] `POST /api/audio/ambient` route
- [ ] `POST /api/audio/music` route
- [ ] Audio settings in chat (volume, auto-play, mixing)

### Phase 3 — Sound Effects

- [ ] SFX trigger detection (message contains action verbs)
- [ ] SFX library (pre-generated common sounds)
- [ ] SFX generation via Bark or ComfyUI
- [ ] Event-driven SFX (door open, combat hit, spell cast)
- [ ] SFX volume + spatial positioning

### Phase 4 — Video Generation (Future)

- [ ] Wan 2.1/2.2 video model integration
- [ ] LTX-2.3 video+audio integration
- [ ] Scene-to-video prompt generation
- [ ] Video asset storage + playback
- [ ] Video generation queue (long-running)
- [ ] Device-tier gating (GPU required)

### Phase 5 — Gallery Asset Reuse & Multimodal Generation

Leverage existing gallery assets (`src/assets/`) with metadata (`alt_text`,
`mime_type`, `width/height/duration`, `metadata` JSON) as input for edit/creation.
This enables multimodal generation: image→video, audio→enhanced, narration→sound.

- [ ] Asset metadata extraction for generation context
  - Read `alt_text`, `mime_type`, dimensions, duration from asset record
  - Parse `metadata` JSON for additional context (camera angle, mood, etc.)
  - Use `asset_links` labels as semantic tags
- [ ] Image-to-video pipeline
  - Select gallery image → generate video continuation
  - Use image metadata (alt_text, dimensions) as prompt context
  - ComfyUI Wan/LTX workflow for img2vid
- [ ] Audio enhancement pipeline
  - Select gallery audio → enhance (noise removal, mastering, format convert)
  - Use audio metadata (duration, sample rate) as constraints
  - ComfyUI audio upscale workflow
- [ ] Multimodal generation orchestrator
  - Route requests across modalities (image, audio, video, text)
  - Detect input modality from asset type
  - Chain providers: e.g. TTS→audio enhance→ambient mix
- [ ] Asset reuse API
  - `POST /api/generate/from-asset` — generate new content from existing asset
  - `GET /api/assets/:id/generation-context` — extract metadata for prompts
  - `POST /api/generate/multimodal` — chain across modalities

### Phase 6 — Narration & Sounding

Full narration pipeline: read text aloud with character voice, emotion, and
ambient sound backing. "Sounding" = TTS + ambient + SFX mixed together.

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

- Existing: `src/generation/providers/comfyui.ts` (for ComfyUI audio/video)
- Existing: `src/assets/` (asset storage + linking)
- Existing: `src/db/enums-content.ts` (audio/video MIME types)
- New: Audio player component
- New: TTS provider(s)

## Files (proposed)

- `src/generation/providers/tts.ts` — TTS provider interface
- `src/generation/providers/edge-tts.ts` — Edge-TTS client
- `src/generation/audio/` — audio generation pipeline
- `src/generation/audio/ambient.ts` — ambient sound system
- `src/generation/audio/music.ts` — music generation
- `src/generation/audio/sfx.ts` — sound effects
- `src/generation/video/` — video generation pipeline
- `src/routes/audio.ts` — audio API routes
- `src/components/audio-player.html` — audio playback UI
- `src/frontend/alpine/audio.ts` — audio player Alpine component

## Open Questions

1. **TTS provider priority:** Which TTS to integrate first? Edge-TTS is free but lower quality.
2. **Audio streaming:** Should TTS stream audio or return complete file?
3. **Caching:** Should generated audio be cached? For how long?
4. **Licensing:** Are there licensing concerns with generated audio?
5. **Device requirements:** Video generation needs GPU — how to gate?

## Linked Tasks

- TASK-ambient-sound-system.md
- TASK-audio-player-component.md
- TASK-multimodal-asset-reuse.md
- TASK-narration-pipeline.md
- TASK-tts-edge-integration.md
