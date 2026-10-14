<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Audio, Video & Sound Generation

**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started overall; the audio prompt-template layer (FEAT-065-SUB-AUDIO) and audio/video template CRUD are done, so Phases 2-3 are partially scaffolded. No audio or video generation dispatch exists.
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

Sub-epic status (verified 2026-10-14): TTS Foundation — Not Started; Ambient,
Music & SFX — partially scaffolded (prompt templates done, dispatch missing);
Video Generation — Not Started (prompt profiles only); Multimodal Asset Reuse —
Not Started; Narration Pipeline — Not Started. Only the Ambient/Music/SFX
sub-epic has an implementation ticket in flight (TASK-ambient-sound-system).

## Slicing Rationale

The original single task list mixed six loosely-coupled domains. The splits
follow dependency order:

1. **TTS Foundation** — core audio primitive every later phase consumes.
2. **Ambient, Music & SFX** — one coherent scene-audio domain (Phases 2–3 kept together).
3. **Video Generation** — Future; gated on GPU availability and base pipelines.
4. **Multimodal Asset Reuse** — extends generation across modalities once base pipelines exist.
5. **Narration Pipeline** — composes TTS + ambient + SFX; depends on slices 1–2.

## Current State (verified 2026-10-14)

| Area | File | State | Notes |
| --- | --- | --- | --- |
| Image generation | `src/generation/image-gen-route.ts` | Built | sd-server + ComfyUI |
| Audio in assets | `src/db/enums-content.ts` | Schema | `AssetType.Audio = "audio"` exists |
| Video in assets | `src/db/enums-content.ts` | Schema | `AssetType.Video = "video"` exists |
| Audio prompt templates + profiles | `src/generation/audio-prompt-templates.ts`, `audio-prompt-profiles.ts` | Built | FEAT-065-SUB-AUDIO (Done) — subtypes, families, detail levels, prompt formats |
| Audio/video template CRUD | `src/routes/templates/modality.ts` | Built | `POST /api/templates/audio` and `/video` create rows; unified `POST /api/templates/:id/apply` renders prompts only |
| Audio/video generation dispatch | `POST /api/templates/audio/:id/apply`, `POST /api/templates/video/:id/apply` | Missing | 501 for both modalities — `src/routes/templates/modality.ts:189-201`; no audio or video provider |
| ComfyUI client | `src/generation/providers/comfyui.ts` | Partial | Image-only output extraction; terminal sinks list `SaveVideo` but nothing reads audio/video outputs |
| TTS provider | — | Missing | No TTS integration |
| Ambient sound | `src/generation/audio/` | Missing | Directory does not exist |
| Music generation | — | Missing | No music generation (external music *linking* exists, see boundary note) |
| SFX system | — | Missing | `/sfx` and `/music` assistant commands are `available: false` stubs |
| Video generation | — | Missing | No video pipeline; Wan/LTX are prompt profiles only (`video-prompt-profiles.ts`) |
| Audio player UI | `src/components/*.html`, `src/frontend/asset-preview.ts` | Partial | Native `<audio controls>` in asset/chat preview modals; no dedicated player, no ambient controls |

Scope boundary (verified 2026-10-14): **music linking** (`src/routes/music-links.ts`,
TASK-frontend-chat-music-links, TASK-chat-external-music-linking) and **voice notes**
(`src/routes/messages/helpers.ts` `voice-note` label, TASK-voice-notes-playback) are
playback/embedding features for user-supplied media — they are NOT generation and are
not covered by this epic or its sub-epics.

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

- Existing: `src/generation/providers/comfyui.ts` — ComfyUI client; image-only today,
  needs audio/video output extraction before ComfyUI audio/video workflows can run
- Existing: `src/assets/` (asset storage + linking — `createAsset` accepts `assetType:
  "audio"` / `"video"` and stores bytes + metadata)
- Existing: `src/db/enums-content.ts` (audio/video `AssetType` values)
- Existing: `src/generation/audio-prompt-profiles.ts` / `video-prompt-profiles.ts`
  (FEAT-065-SUB-AUDIO / FEAT-065-SUB-VIDEO, Done) — prompt composition for every
  subtype, ready for a dispatch to consume
- Existing seam: `POST /api/templates/{audio,video}/:id/apply` is routed and answers
  501 — the dispatch lands here, not in a new route family

## Open Questions

1. **Provider selection:** audio providers are not in `generation.providers.sd`
   (that array is image-shaped). Decide whether audio providers extend that array
   with a new `apiFamily` or get their own config section before Phase 2-3 dispatch
   is wired.
2. **Caching:** Should generated audio be cached? For how long? (Default: no cache
   until a repeat-generation cost shows up — assets already dedupe-by-row.)
3. **Licensing:** Are there licensing concerns with generated audio? (Applies to
   Bark/ElevenLabs voices; unresolved.)

Sub-epic-specific questions live in their respective files.
