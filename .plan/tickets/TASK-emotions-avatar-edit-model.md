# TASK: Emotions Avatar Feature — Edit Model Support

**Status:** ⬜ Blocked (by edit model stability)
**Priority:** Low
**Effort:** High
**Blocked by:** Stable diffusion edit model ecosystem maturity

## Summary

Generate character avatars with different emotional expressions (happy, sad, angry, etc.) using image edit models. Currently blocked because edit models are not stable enough for reliable production use.

## Rationale

- Characters in chat benefit from dynamic emotional avatars
- Users expect visual feedback matching conversation tone
- Standard diffusion models generate but don't edit — need edit-specific models

## Why Blocked

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

### When Edit Models Stabilize

- [ ] Audit sd.cpp / ComfyUI edit model support status
- [ ] Test edit model reliability (100 generations, measure consistency)
- [ ] Design emotion-to-prompt mapping system
- [ ] Extend image gen provider registry for edit models
- [ ] Add "Edit Model" settings entry
- [ ] Implement emotion avatar generation pipeline
- [ ] Add per-character emotion avatar configuration
- [ ] Add emotion detection from chat messages (LLM-based)
- [ ] Auto-update avatar on emotion change (optional, configurable)
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

Revisit when:

- [ ] sd.cpp edit models pass 95%+ consistency test
- [ ] ComfyUI edit workflows稳定 for production use
- [ ] Alternative services (Replicate,fal.ai) offer stable edit APIs

## Risk

High — requires mature edit model ecosystem, significant UI/UX work, resource management complexity. Block by design until ecosystem stabilizes.
