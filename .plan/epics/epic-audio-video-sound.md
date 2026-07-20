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
