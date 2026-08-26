<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: TTS Foundation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** tts, voice, speech, audio, generation
**Parent Epic:** Audio, Video & Sound Generation (epic-audio-video-sound.md)

## Overview

Per-character text-to-speech synthesis: provider abstraction, free (Edge-TTS)
and paid (OpenAI) integrations, voice presets with emotion control, the
synthesize API route, and frontend playback. This is the core audio primitive
every later audio phase builds on.

## Sub-Epic of

Part of the **Audio, Video & Sound Generation** mega-epic (Phase 1). See parent
epic for full scope and slicing rationale.

## Scope

- TTS provider interface (`src/generation/providers/tts.ts`)
- Edge-TTS (free, local, no API key) and OpenAI TTS (paid, high quality)
- Per-character voice presets stored in character settings
- Emotion/tone parameter mapping
- `POST /api/tts/synthesize` route
- Audio player component and opt-in auto-play on message receive

## Design

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

## Key Integrations

- Characters: voice presets stored per character
- Assets: generated audio linked to messages (`src/assets/`)
- Narration Pipeline (`epic-narration-pipeline.md`): consumes this provider layer

## Tasks

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

## Dependencies

- Parent hub: Audio, Video & Sound Generation (`epic-audio-video-sound.md`)
- Existing: `src/assets/` (asset storage + linking)
- Existing: `src/db/enums-content.ts` (audio MIME type)
- New: TTS provider(s)

## Files (proposed)

- `src/generation/providers/tts.ts` — TTS provider interface
- `src/generation/providers/edge-tts.ts` — Edge-TTS client
- `src/components/audio-player.html` — audio playback UI
- `src/frontend/alpine/audio.ts` — audio player Alpine component

## Linked Tasks

- TASK-tts-edge-integration.md
- TASK-audio-player-component.md

## Open Questions

1. **TTS provider priority:** Which TTS to integrate first? Edge-TTS is free but lower quality.
2. **Audio streaming:** Should TTS stream audio or return complete file?
