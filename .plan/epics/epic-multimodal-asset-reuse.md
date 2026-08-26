<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Multimodal Asset Reuse

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** multimodal, assets, gallery, generation, api
**Parent Epic:** Audio, Video & Sound Generation (epic-audio-video-sound.md)

## Overview

Leverage existing gallery assets (`src/assets/`) with metadata (`alt_text`,
`mime_type`, `width/height/duration`, `metadata` JSON) as input for edit/creation.
This enables multimodal generation: image→video, audio→enhanced, narration→sound
(Phase 5 of the parent epic).

## Sub-Epic of

Part of the **Audio, Video & Sound Generation** mega-epic. See parent epic for
full scope and slicing rationale.

## Scope

- Asset metadata extraction for generation context
- Image-to-video pipeline (gallery image → video continuation)
- Audio enhancement pipeline (noise removal, mastering, format convert)
- Multimodal generation orchestrator routing across modalities
- From-asset / generation-context / multimodal APIs

## Key Integrations

- Assets: `src/assets/` records and `asset_links` labels as semantic tags
- Video Generation (`epic-video-generation.md`): img2vid uses ComfyUI Wan/LTX workflows
- TTS Foundation + Ambient/Music/SFX (`epic-tts-foundation.md`,
  `epic-ambient-music-sfx.md`): orchestrator chains providers, e.g. TTS → audio
  enhance → ambient mix

## Tasks

### Phase 5 — Gallery Asset Reuse & Multimodal Generation

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

## Dependencies

- Parent hub: Audio, Video & Sound Generation (`epic-audio-video-sound.md`)
- Sibling: Video Generation (`epic-video-generation.md`) — Wan/LTX img2vid workflows
- Sibling: TTS Foundation (`epic-tts-foundation.md`) — orchestrator provider chaining
- Existing: `src/assets/` (asset storage + linking)

## Linked Tasks

- TASK-multimodal-asset-reuse.md
