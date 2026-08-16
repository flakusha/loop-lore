<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-065-VID: Video Generation Templates

**Status**: open
**Priority**: low
**Labels**: generation, video, prompts, templates
**Assignee**:
**Epic**: EPIC-38 (Output Control & Transforms)
**Parent**: FEAT-065 (Prompt Library)
**Related**: (future) Video provider features

---

## Description

Design the **video generation prompt template system** — schema, variables, model families, and prompt formats. No route wiring yet (video generation not implemented), but scaffold the template layer so it slots in when `src/generation/video-gen-route.ts` lands.

### Current State

❌ **Not implemented**. Docs mention video models as future:

- `docs/spec/integrations/image-generation.md`: "Wan 2.1/2.2 (video), LTX-2.3 (video+audio)"
- No `src/generation/video-*` files exist

---

## Scope

### Model Families (proposed)

| Family                       | Style                     | Notes                   |
| ---------------------------- | ------------------------- | ----------------------- |
| Wan 2.1/2.2                  | Natural language + motion | Alibaba, open-weight    |
| LTX-2.3                      | Natural + audio           | Lightricks, video+audio |
| SVD (Stable Video Diffusion) | Image-to-video            | Stability               |
| AnimateDiff                  | Motion modules            | SD extension            |
| Mochi                        | Natural language          | Genmo                   |
| HunyuanVideo                 | Natural language          | Tencent                 |

### Prompt Formats (proposed)

1. **natural** — Flowing description of subject + motion + style
2. **keyframe-tags** — `[0s: subject enters] [2s: camera pans]` style markers
3. **json** — `{ subject, motion, camera, style, duration, aspect_ratio }`

### Variables (proposed)

| Variable             | Source                           | Example                              |
| -------------------- | -------------------------------- | ------------------------------------ |
| `{{subject}}`        | actors.display_name / user input | "Aria casting a spell"               |
| `{{motion}}`         | user input / scene               | "slowly raises hands, energy swirls" |
| `{{style}}`          | world/actor style settings       | "cinematic, volumetric lighting"     |
| `{{duration}}`       | request param                    | "4s"                                 |
| `{{aspectRatio}}`    | request param                    | "16:9"                               |
| `{{cameraMovement}}` | request param                    | "slow dolly in"                      |
| `{{negativePrompt}}` | request param                    | "blurry, distorted"                  |

### Detail Levels (mirror image system)

- `instant` (~160 tok) — "short tags: subject + motion"
- `balanced` (~320) — "one paragraph: subject, motion, style"
- `detailed` (~600) — "detailed: subject, motion, camera, lighting, mood"

### Gen Modes (proposed)

- `text2video` — from prompt
- `image2video` — from source frame + motion description
- `scene` — from chat scene summary
- `last` — from last message content

### API (scaffold)

- [ ] `POST /api/templates/video` — create
- [ ] `GET /api/templates/video` — list
- [ ] `GET /api/templates/video/:id` — retrieve
- [ ] `PATCH /api/templates/video/:id` — update
- [ ] `DELETE /api/templates/video/:id` — delete
- [ ] `POST /api/templates/video/:id/apply` — render

### Files (new, scaffold only)

- `src/db/migrations/0XX_video_templates.ts`
- `src/db/schema-generation.ts` — `VideoPromptTemplateRow`
- `src/generation/video-prompt-templates.ts` — mirror `prompt-templates.ts` structure
- `src/routes/templates.ts` — video endpoints (return 501 if no provider)

---

## Acceptance Criteria

- [ ] Video template schema defined (family, format, mode, detail, variables)
- [ ] `src/generation/video-prompt-templates.ts` exists with `resolveTemplate()`, `resolveProfile()`, `buildVideoPromptMessages()`
- [ ] CRUD API returns 200 for create/list (501 on apply until provider lands)
- [ ] Unit tests: template resolution, variable substitution
- [ ] Migration adds `video_prompt_templates` table

---

## Notes

### Why Separate from Image

Video prompts need **temporal variables** (motion, duration, camera movement) absent in image prompts. Different construction logic.

### Reference

- `src/generation/prompt-templates.ts` — image template pattern to mirror
- `docs/spec/integrations/image-generation.md` — video model mentions
