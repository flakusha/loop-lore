# FEAT-065: Prompt Library — Expanded Scope (Generation Templates)

**Status**: open
**Priority**: high
**Labels**: generation, prompts, templates
**Assignee**:
**Epic**: EPIC-38 (Output Control & Transforms) — _proposed split: new EPIC-Generation-Templates_
**Related**: FEAT-084 (DALL-E 3), FEAT-085 (Stability AI), FEAT-086 (Replicate), FEAT-090 (OpenAI TTS+Whisper), FEAT-089 (ElevenLabs), FEAT-091 (Local TTS/STT)

---

## Description

Unified **prompt template system** for all generation modalities — LLM text, image, video, audio/sound. Different scenarios and model families require fundamentally different prompt construction: context injection strategy, logic, detail level, description form (tags vs natural language vs JSON), and context limits all vary per modality and per model.

### Current State

| Modality        | Code Status                                                                  | Template System                                                                     |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **LLM text**    | ✅ `src/generation/generate-route.ts`, `src/assistant/prompt-assembler.ts`   | Section-based assembler (hardcoded sections, no user templates)                     |
| **Image**       | ✅ `src/generation/image-gen-route.ts`, `src/generation/prompt-templates.ts` | **Implemented** — 13 model families, 4 prompt formats, 3 detail levels, 8 gen modes |
| **Video**       | ❌ Not implemented                                                           | None — docs mention Wan 2.1/2.2, LTX-2.3 as future                                  |
| **Audio/Sound** | ❌ Not implemented                                                           | None — docs mention ElevenLabs, OpenAI TTS, Piper as future                         |

### Problem Statement

1. **No template persistence** — Image templates are hardcoded in `BUILTIN_PROFILES` (`src/generation/prompt-templates.ts:255`). Users cannot save/customize.
2. **No cross-modality unification** — LLM assembler and image templates are separate systems with no shared interface.
3. **Video/audio missing** — No template scaffolding for future modalities.
4. **Per-model variance** — Each model family (SD1 vs FLUX vs Ideogram; GPT-4o vs Claude vs Gemini) needs distinct prompt construction logic.

---

## Scope

### Tier 1: Template Persistence (LLM + Image)

- [ ] DB schema: `prompt_templates` table (id, owner_id, modality, model_family, name, template_body, variables, detail_level, created_at, updated_at)
- [ ] DB schema: `template_variables` (template_id, key, default_value, description)
- [ ] API: `POST /api/templates` (create), `GET /api/templates` (list by modality), `GET /api/templates/:id`, `PATCH /api/templates/:id`, `DELETE /api/templates/:id`
- [ ] API: `POST /api/templates/:id/apply` (render template with context)
- [ ] Migration: `src/db/migrations/0XX_prompt_templates.ts`
- [ ] Service: `src/generation/template-service.ts` (CRUD + render)
- [ ] Wire image-gen-route to use user templates when provided

### Tier 2: LLM Template System

- [ ] Extract hardcoded `PromptAssembler` sections into user-overridable templates
- [ ] Template variables: `{{charName}}`, `{{userDescription}}`, `{{chatHistory}}`, `{{sceneSummary}}`, `{{loreEntries}}`, `{{memories}}`
- [ ] Per-actor template override (actors.settings.prompt_template_id)
- [ ] Per-chat template override (chats.settings.prompt_template_id)
- [ ] Preset library: "Roleplay", "Assistant", "Story-GM", "Code", "Creative"

### Tier 3: Video Generation Templates (new)

- [ ] Model families: Wan 2.1/2.2, LTX-2.3, SVD, AnimateDiff, Mochi, HunyuanVideo
- [ ] Prompt formats: natural language (motion description), keyframe tags, JSON (camera params)
- [ ] Variables: `{{subject}}`, `{{motion}}`, `{{style}}`, `{{duration}}`, `{{aspectRatio}}`, `{{cameraMovement}}`
- [ ] Detail levels: instant / balanced / detailed (affects motion description verbosity)
- [ ] Integration point: `src/generation/video-gen-route.ts` (future)

### Tier 4: Audio/Sound Generation Templates (new)

- [ ] Model families: ElevenLabs v3, OpenAI TTS, Piper, Bark, MusicGen, Suno-style
- [ ] Sub-types: TTS (voice + emotion), SFX (sound design), Music (genre + mood)
- [ ] Prompt formats: natural language (style description), SSML (TTS markup), JSON (music params)
- [ ] Variables: `{{speaker}}`, `{{emotion}}`, `{{tone}}`, `{{pace}}`, `{{genre}}`, `{{instrumentation}}`
- [ ] Integration point: `src/generation/audio-gen-route.ts` (future)

### Tier 5: Unified Template Registry

- [ ] Shared `TemplateRegistry` interface across modalities
- [ ] Model→template auto-matching (like `DEFAULT_PROFILE_REGISTRY.modelMatching`)
- [ ] Template marketplace export/import (see `docs/ideas/prompt-output-control.md#9`)

---

## Acceptance Criteria

- [ ] User can create, list, retrieve, update, delete prompt templates per modality
- [ ] Image generation uses user template when `templateId` provided in request
- [ ] LLM generation uses actor/chat template override when set
- [ ] Video/audio template schemas exist (even if routes not wired)
- [ ] `bun run check` passes; unit tests for template-service CRUD + render
- [ ] Migration adds `prompt_templates` + `template_variables` tables

---

## Notes

### Image Template System (already implemented)

`src/generation/prompt-templates.ts` exports:

- **Model families** (13): `sd1`, `sd2`, `sdxl`, `illustrious`, `noob`, `pony`, `sd3`, `flux`, `krea2`, `anima`, `ideogram`, `qwen`, `chroma`
- **Prompt formats** (4): `tags`, `natural`, `tags-and-natural`, `json`
- **Gen modes** (8): `yourself`, `face`, `me`, `scene`, `last`, `raw_last`, `background`, `free`
- **Detail levels** (3): `instant` (~160 tok), `balanced` (~320), `detailed` (~600)
- **Functions**: `resolveTemplate()`, `resolveProfile()`, `generatePrompt()`, `buildImageSystemPrompt()`, `buildImagePromptMessages()`, `buildImagePrompt()`
- **Token substitution**: `{{charName}}`, `{{charDescription}}`, `{{userName}}`, `{{userDescription}}`, `{{lastMessage}}`, `{{sceneSummary}}`, `{{chatHistory}}`, `{{negativePrompt}}`, `{{charPrefix}}`

### LLM Template System (section-based, hardcoded)

`src/assistant/prompt-assembler.ts` + `src/assistant/prompt/registry.ts`:

- **Sections** (13): system, author-note, actor-header, group-participants, user-persona, lore, memory, post-history, story-context, dynamic-context, recent-events, examples, chat-history
- **Token budget trimming**: drops low-priority sections when over budget
- **No user override** — sections are fixed in code

### Reference Docs

- `docs/spec/integrations/image-generation.md` — Image model families, prompt styles per model
- `docs/spec/integrations/llm-serving.md` — LLM presets, prompt template structure
- `docs/frontend/chat/prompt-creation.md` — Prompt assembly pipeline design
- `docs/ideas/prompt-output-control.md` — #9 Prompt-template & lorebook marketplace
- `docs/spec/provider-system.md` — Provider architecture

---

## Subtasks

| ID           | Title                             | Modality       | Status     |
| ------------ | --------------------------------- | -------------- | ---------- |
| FEAT-065-LLM | LLM prompt template system        | LLM            | 📋 Planned |
| FEAT-065-IMG | Image prompt template persistence | Image          | 📋 Planned |
| FEAT-065-VID | Video generation templates        | Video          | 📋 Planned |
| FEAT-065-AUD | Audio/sound generation templates  | Audio          | 📋 Planned |
| FEAT-065-REG | Unified template registry         | Cross-modality | 📋 Planned |
