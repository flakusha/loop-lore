<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Audio, Video & Sound Generation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High (split into 5 sub-epics)
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

> **⚠️ This epic is a coordination hub.** Implementation work lives in the 5
> sub-epics below; each is independently shippable. This file retains only
> shared cross-cutting design context.

## Sub-Epics

| Sub-Epic                   | Epic File                          | Phases            | Scope                                                                                              | Priority |
| -------------------------- | ---------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------- | -------- |
| **TTS Foundation**         | `epic-tts-foundation.md`           | Phase 1           | Provider interface, Edge-TTS/OpenAI, voice presets, emotion mapping, synthesize route, audio player | Medium   |
| **Ambient, Music & SFX**   | `epic-ambient-music-sfx.md`        | Phases 2–3        | Scene-audio domain: ambient/music/SFX providers, layered mixing, crossfade, spatial positioning    | Medium   |
| **Video Generation**       | `epic-video-generation.md`         | Phase 4 (Future)  | Wan 2.1/2.2 + LTX-2.3, scene-to-video prompts, queue, GPU gating                                   | Low      |
| **Multimodal Asset Reuse** | `epic-multimodal-asset-reuse.md`   | Phase 5           | Asset metadata extraction, img2vid, audio enhancement, multimodal orchestrator APIs                | Medium   |
| **Narration Pipeline**     | `epic-narration-pipeline.md`       | Phase 6           | Marker segmentation, voice+emotion mapping, ambient backing, timestamped SFX, karaoke playback     | Medium   |

## Slicing Rationale

The original single task list mixed six loosely-coupled domains. The splits
follow dependency order:

1. **TTS Foundation** — core audio primitive every later phase consumes.
2. **Ambient, Music & SFX** — one coherent scene-audio domain (Phases 2–3 kept together).
3. **Video Generation** — Future; gated on GPU availability and base pipelines.
4. **Multimodal Asset Reuse** — extends generation across modalities once base pipelines exist.
5. **Narration Pipeline** — composes TTS + ambient + SFX; depends on slices 1–2.

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

## Shared Design

### Audio Generation Pipeline

```
Trigger (message/narration/event)
→ Intent detection (what kind of audio?)
→ Provider selection (TTS/ambient/music/SFX)
→ Generation (local API or cloud)
→ Asset storage (link to chat/message/location)
→ Frontend playback (audio element + controls)
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

Per-subsystem interface blocks (TTS request/result, ambient track/layer
shapes) live in the sub-epic that owns them.

## Dependencies

- Existing: `src/generation/providers/comfyui.ts` (for ComfyUI audio/video)
- Existing: `src/assets/` (asset storage + linking)
- Existing: `src/db/enums-content.ts` (audio/video MIME types)

## Open Questions

1. **Caching:** Should generated audio be cached? For how long?
2. **Licensing:** Are there licensing concerns with generated audio?

Sub-epic-specific questions live in their respective files.
