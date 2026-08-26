<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Video Generation

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Type:** Feature Epic
**Tags:** video, generation, wan, ltx, comfyui
**Parent Epic:** Audio, Video & Sound Generation (epic-audio-video-sound.md)

## Overview

Scene animation from narration via open video models (Phase 4 of the parent
epic). **Marked Future:** not planned for an near-term release; gated on GPU
availability and on the audio/generation pipelines landing first.

## Sub-Epic of

Part of the **Audio, Video & Sound Generation** mega-epic. See parent epic for
full scope and slicing rationale.

## Scope

- Wan 2.1/2.2 and LTX-2.3 model integrations
- Scene-to-video prompt generation from narration
- Video asset storage + playback
- Long-running generation queue with device-tier (GPU) gating

## Key Integrations

- ComfyUI provider (`src/generation/providers/comfyui.ts`) — video workflows
- Assets: `video` MIME type already exists in `src/db/enums-content.ts`
- Multimodal Asset Reuse (`epic-multimodal-asset-reuse.md`): image-to-video
  pipeline reuses the Wan/LTX workflows defined here

## Tasks

### Phase 4 — Video Generation (Future)

- [ ] Wan 2.1/2.2 video model integration
- [ ] LTX-2.3 video+audio integration
- [ ] Scene-to-video prompt generation
- [ ] Video asset storage + playback
- [ ] Video generation queue (long-running)
- [ ] Device-tier gating (GPU required)

## Dependencies

- Parent hub: Audio, Video & Sound Generation (`epic-audio-video-sound.md`)
- Existing: `src/generation/providers/comfyui.ts` (for ComfyUI video workflows)
- Existing: `src/assets/` (asset storage + linking)

## Files (proposed)

- `src/generation/video/` — video generation pipeline

## Open Questions

1. **Device requirements:** Video generation needs GPU — how to gate?
