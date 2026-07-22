# FEAT-065-IMG: Image Prompt Template Persistence

**Status**: open
**Priority**: medium
**Labels**: generation, image, prompts, templates
**Assignee**:
**Epic**: EPIC-38 (Output Control & Transforms)
**Parent**: FEAT-065 (Prompt Library)
**Related**: FEAT-084 (DALL-E 3), FEAT-085 (Stability AI), FEAT-086 (Replicate)

---

## Description

Make the existing image prompt template system (`src/generation/prompt-templates.ts`) **user-customizable and persistable**. Currently `BUILTIN_PROFILES` is hardcoded; users cannot save custom templates or override built-in ones.

### Current State

✅ **Already implemented** in `src/generation/prompt-templates.ts` (663 lines):

- **13 model families**: `sd1`, `sd2`, `sdxl`, `illustrious`, `noob`, `pony`, `sd3`, `flux`, `krea2`, `anima`, `ideogram`, `qwen`, `chroma`
- **4 prompt formats**: `tags`, `natural`, `tags-and-natural`, `json`
- **8 gen modes**: `yourself`, `face`, `me`, `scene`, `last`, `raw_last`, `background`, `free`
- **3 detail levels**: `instant` (~160 tok), `balanced` (~320), `detailed` (~600)
- **Functions**: `resolveTemplate()`, `resolveProfile()`, `generatePrompt()`, `buildImageSystemPrompt()`, `buildImagePromptMessages()`, `buildImagePrompt()`

### Gap

Templates are **read-only constants**. No DB persistence, no user override, no API.

---

## Scope

### Template Schema (extension of existing types)

```typescript
interface ImagePromptTemplateRow {
  id: string;
  owner_id: string;
  name: string;
  model_family: ImageModelFamily; // sd1, sdxl, flux, etc.
  prompt_format: PromptFormat; // tags | natural | tags-and-natural | json
  detail_level: DetailLevel; // instant | balanced | detailed
  gen_mode: SdGenMode; // yourself | face | me | scene | last | background | free
  template_body: string; // contains {{variables}}
  is_builtin: boolean; // false for user templates
  created_at: string;
  updated_at: string;
}
```

### Variables (from existing `TemplateContext`)

`{{charName}}`, `{{charDescription}}`, `{{userName}}`, `{{userDescription}}`, `{{lastMessage}}`, `{{sceneSummary}}`, `{{chatHistory}}`, `{{negativePrompt}}`, `{{charPrefix}}`

### API

- [ ] `POST /api/templates/image` — create custom template
- [ ] `GET /api/templates/image` — list (owner + builtin)
- [ ] `GET /api/templates/image/:id` — retrieve
- [ ] `PATCH /api/templates/image/:id` — update
- [ ] `DELETE /api/templates/image/:id` — delete
- [ ] `POST /api/templates/image/:id/apply` — render with `TemplateContext`

### Wiring

- [ ] `image-gen-route.ts` accepts `templateId` in request body
- [ ] If `templateId` provided → load user template, else use `BUILTIN_PROFILES`
- [ ] `buildImagePromptMessages()` accepts `templateOverride` param

---

## Acceptance Criteria

- [ ] User can save custom image prompt template (family + format + mode + body)
- [ ] User template overrides builtin when `templateId` passed to image-gen-route
- [ ] `{{variables}}` render correctly from chat context
- [ ] CRUD API + unit tests
- [ ] Migration adds `image_prompt_templates` table

---

## Notes

### Files to Touch

- `src/db/migrations/0XX_image_templates.ts` — new table
- `src/db/schema-generation.ts` — table types
- `src/generation/template-service.ts` — extends with image methods
- `src/generation/image-gen-route.ts` — accept `templateId`
- `src/generation/prompt-templates.ts` — `buildImagePromptMessages()` accepts override
- `src/routes/templates.ts` — API routes

### Reference

- `src/generation/prompt-templates.ts` — existing implementation (lines 1-663)
- `docs/spec/integrations/image-generation.md` — model families, prompt styles
