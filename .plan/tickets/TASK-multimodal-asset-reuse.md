# TASK: Gallery Asset Reuse for Multimodal Generation

**Priority:** High
**Status:** ⬜ Not Started
**Epic:** epic-audio-video-sound (Phase 5)

## Description

Leverage existing gallery assets with metadata (`alt_text`, `mime_type`,
dimensions, `metadata` JSON) as input for edit/creation pipelines. This
enables multimodal generation: use a character portrait to generate a video,
use ambient audio to enhance a scene, combine narration with sound effects.

## Current State

- Assets table has: `alt_text`, `mime_type`, `width/height`, `duration_secs`, `metadata` (JSON)
- Asset links have: `label` (semantic tag), `entity_type/entity_id` (polymorphic)
- Image metadata extraction exists: `src/assets/metadata.ts` (PNG/JPEG/WebP/GIF)
- ComfyUI client exists: `src/generation/providers/comfyui.ts`

## Acceptance Criteria

- [ ] `GET /api/assets/:id/generation-context` — extracts metadata as prompt context
- [ ] `POST /api/generate/from-asset` — generates new content from existing asset
- [ ] Image-to-video pipeline (gallery image → video continuation via ComfyUI)
- [ ] Audio enhancement pipeline (gallery audio → enhanced/processed)
- [ ] Multimodal orchestrator (chain across modalities: TTS→enhance→mix)
- [ ] Asset metadata enrichment (add generation params to metadata JSON)
- [ ] Unit tests for metadata extraction + generation context

## Technical Notes

- Generation context should include: alt_text, mime_type, dimensions, duration, linked entity labels
- ComfyUI workflows for img2vid, audio upscale, style transfer
- Store generation params in asset metadata JSON for reproducibility
- Consider: should generation context include linked entity context (character name, location)?
