# TASK: Emotions Avatar Feature — Edit Model Support

**Status:** ✅ Phase 1 Complete (generation fallback)
**Priority:** Medium
**Effort:** High
**Blocked by:** Stable diffusion edit model ecosystem maturity (fallback mitigates)

## Summary

Generate character avatars with different emotional expressions (happy, sad, angry, etc.) using image edit models. Primary path uses SD edit models (img2img); **fallback uses SD generation models (txt2img)** with original avatar metadata/captioning for prompt construction.

## Rationale

- Characters in chat benefit from dynamic emotional avatars
- Users expect visual feedback matching conversation tone
- Standard diffusion models generate but don't edit — need edit-specific models
- **Generation fallback ensures progress even while edit models mature**

## Generation Fallback Strategy

### Primary Path: Edit Model (img2img)

```
Original avatar → SD edit model (FLUX.1 Kontext / Qwen Image Edit)
  + emotion modifier prompt
  → Emotion variant avatar
```

- Preserves original character appearance
- Instruction-based: "make the character smile"
- Requires: edit-capable model loaded in sd-server/ComfyUI

### Fallback Path: Generation Model (txt2img)

```
Original avatar → Extract metadata + caption
  + emotion modifier prompt
  → SD generation model (txt2img)
  → Emotion variant avatar
```

- Uses original image's metadata and captioning as prompt foundation
- Combines with emotion-specific modifier (e.g., "happy expression, smiling")
- Generates new image from text prompt only — no reference image needed
- Works with any txt2img-capable model (SD 1.x/2.x, SDXL, SD3, FLUX, etc.)

### Metadata/Captioning Source

The original avatar image can contain:

| Metadata Source                  | Use in Prompt               | Example                                     |
| -------------------------------- | --------------------------- | ------------------------------------------- |
| Image caption (auto-generated)   | Scene/character description | "portrait of a young woman with red hair"   |
| User-provided alt text           | Character identity          | "Aria, the elven mage"                      |
| Asset tags                       | Style/setting context       | `{"style": "anime", "setting": "fantasy"}`  |
| Generation prompt (if generated) | Full original prompt        | "anime girl, red hair, blue eyes, detailed" |
| EXIF/metadata                    | Technical details           | Resolution, model used                      |

### Prompt Construction (Fallback)

```
[original_caption] + [emotion_modifier] + [quality_tags]

Example:
  "portrait of a young woman with red hair, blue eyes, detailed face"
  + "happy expression, smiling, bright eyes, cheerful"
  + "high quality, detailed, sharp focus"
```

### Fallback Trigger Conditions

| Condition                                 | Action                        |
| ----------------------------------------- | ----------------------------- |
| Edit model not configured                 | Use generation fallback       |
| Edit model endpoint unreachable           | Retry once, then fallback     |
| Edit model returns error                  | Log, fallback to generation   |
| Edit model timeout (>120s)                | Abort, fallback to generation |
| User explicitly selects "generation" mode | Skip edit, use generation     |

### Implementation Notes

- `emotion-avatar-service.ts` already uses txt2img — extend to accept metadata params
- Add `extractAvatarMetadata(assetId)` helper to pull caption/tags/prompt from asset
- Fallback prompt builder: `buildEmotionPrompt(metadata, emotion, qualityTags)`
- Log which path was used for monitoring edit model adoption
- Both paths produce assets linked to character with `emotion:` label

## Why Previously Blocked

### A. Backend Architecture: Flat Avatar Model

**Current model:** `character → avatar` (one-to-one)

```
Characters table:
  id | name | avatar_url | ...
```

**Required model:** `character → avatars[]` (one-to-many, emotion-tagged)

```
Character avatars table (proposed):
  id | character_id | emotion | asset_id | is_default | ...
```

**Impact:**

- `src/routes/characters.ts` — avatar CRUD is single-value, not array
- `src/db/schema-*.ts` — `avatar_url` column on characters, not separate table
- `src/views/characters.html` — single avatar display/edit
- `src/views/chat.html` — avatar in message header assumes one avatar
- `src/frontend/alpine/chat.ts` — avatar URL from character object, no emotion context
- `src/assets/service.ts` — polymorphic linking is `asset → character`, not `asset → character + emotion`

**Migration path:**

1. Create `character_avatars` table (character_id, emotion, asset_id, is_default)
2. Migrate existing `avatar_url` from characters table → new table with `emotion=neutral`
3. Update character CRUD to manage avatar collection
4. Update chat UI to select avatar by emotion
5. Add API endpoint: `GET /api/characters/:id/avatars?emotion=happy`

### B. Edit Model Instability

| Model Type          | Edit Support | Stability | Notes                                  |
| ------------------- | ------------ | --------- | -------------------------------------- |
| Stable Diffusion XL | ❌ No edit   | —         | Standard generation only               |
| Stable Diffusion 3  | ❌ No edit   | —         | Standard generation only               |
| Flux.1              | ❌ Limited   | —         | Inpainting only, not true edit         |
| sd.cpp native       | ⚠️ Partial    | Low       | Supports some edit models but unstable |
| ComfyUI             | ⚠️ Partial    | Low       | Edit workflows exist but inconsistent  |
| DALL-E 3            | ❌ No edit   | —         | Generation only                        |
| Midjourney          | ❌ No edit   | —         | Generation only                        |

**Core issue:** Most multimodal models (generate + edit) are self-hosted and lack stability for production use. Generation and edit are separate capabilities — few models support both.

### B. Resource Management Complexity

Current image gen pipeline handles one model type (main + censor + captioning). Adding edit models requires:

- **Model registry:** Main model, edit model, captioning model — separate entries
- **Resource allocation:** Edit models may need different VRAM/RAM than generation models
- **Model switching:** User selects edit model per-character or per-session
- **Fallback:** If edit model unavailable, fall back to generation-only (no emotions)

### C. Additional UI Requirements

- New "Edit Model" menu entry in settings (similar to LLM provider selection)
- Per-character emotion avatar settings
- Emotion-to-image prompt mapping (happy → smile, angry → furrowed brow, etc.)
- Preview/test edit model connection

## Proposed Architecture (When Ready)

### Model Registry Extension

```
Image Gen Providers:
  ├── Main Model (SD XL, SD3, Flux) — character art
  ├── Edit Model (edit-capable) — emotional variations
  ├── Censor Model — NSFW filtering
  └── Caption Model — image description
```

### Emotion Mapping

| Emotion   | Prompt Modifier        | Example                              |
| --------- | ---------------------- | ------------------------------------ |
| Happy     | smiling, bright eyes   | "character portrait, smiling"        |
| Sad       | tearful, downcast      | "character portrait, sad expression" |
| Angry     | furrowed brow, intense | "character portrait, angry"          |
| Surprised | wide eyes, open mouth  | "character portrait, surprised"      |
| Neutral   | default expression     | "character portrait" (base)          |

### Storage

- Base avatar: `assets/` (existing)
- Emotion variants: `assets/` with metadata tag `emotion=happy`
- Fallback: Use base avatar if edit model unavailable

## Tasks

### Phase 1: Generation Fallback (✅ Complete)

- [x] Implement `extractAvatarMetadata(assetId)` — pull caption, tags, alt text, generation prompt from asset
- [x] Implement `buildEmotionPrompt(metadata, emotion, qualityTags)` — construct txt2img prompt from metadata
- [x] Extend `EmotionAvatarService` to accept metadata params for fallback path
- [x] Add fallback trigger logic (edit model unavailable → use generation)
- [x] Add configuration option: `emotionAvatar.fallbackMode: "generation" | "none"`
- [x] Log fallback usage for monitoring
- [x] Unit tests for metadata extraction and prompt construction (7/7 pass)
- [x] Frontend UI — "🎭 Generate Emotions" button + polling + progress display
- ⏳ E2E testing — deferred (requires running server + SD backends)

### Phase 2: Edit Model Support (When Stable)

- [ ] Audit sd.cpp / ComfyUI edit model support status
- [ ] Test edit model reliability (100 generations, measure consistency)
- [ ] Design emotion-to-prompt mapping system
- [ ] Extend image gen provider registry for edit models
- [ ] Add "Edit Model" settings entry
- [ ] Implement emotion avatar generation pipeline with edit model primary path
- [ ] Add per-character emotion avatar configuration
- [ ] Add emotion detection from chat messages (LLM-based) — see `epic-emotion-avatar-message-binding`
- [ ] Render emotion avatar per message/chat (not global) — see
      `TASK-emotion-avatar-message-binding` / `epic-emotion-avatar-message-binding`
- [ ] Unit tests for emotion mapping + edit pipeline
- [ ] E2E tests for avatar generation flow

## Files to Create (When Ready)

- `src/generation/emotion-map.ts` — emotion-to-prompt mapping
- `src/generation/emotion-avatar.ts` — edit model integration
- `src/generation/emotion-avatar.test.ts` — tests

## Files to Modify (When Ready)

- `src/generation/providers/registry.ts` — add edit model support
- `src/generation/image-gen-route.ts` — emotion avatar endpoint
- `src/config/schema.ts` — edit model config
- `src/views/settings.html` — edit model UI
- `src/routes/characters.ts` — emotion avatar metadata

## Monitoring Criteria

Revisit edit model priority when:

- [ ] sd.cpp edit models pass 95%+ consistency test
- [ ] ComfyUI edit workflows stable for production use
- [ ] Alternative services (Replicate, fal.ai) offer stable edit APIs
- [ ] **Generation fallback quality is insufficient** (prompt-from-metadata not producing recognizable variants)

## Risk

Medium — generation fallback reduces edit model dependency. Main risk is fallback quality: metadata-derived prompts may not preserve character identity as well as img2img editing.
