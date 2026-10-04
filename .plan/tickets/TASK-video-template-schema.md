<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Video prompt template schema (FEAT-065 video slice)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** `epic-audio-video-sound` (Phase 4 via `epic-video-generation.md`)
**Related:** `TASK-video-gen-route.md`, `TASK-video-provider-minimax-h3.md`, `FEAT-065-sub-video.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Build the video prompt-template schema the FEAT-065 scaffold specifies
(`FEAT-065-sub-video.md:99-105`): `VideoPromptTemplateRow` +
`src/generation/video-prompt-templates.ts` with `resolveTemplate()`,
`resolveProfile()`, `buildVideoPromptMessages()`, CRUD API, and the
`video_prompt_templates` migration. Extends the image template system
(`src/generation/prompt-templates/`, `src/generation/template-service/`,
`src/generation/template-types.ts`) with temporal variables video needs.

## Context

The image template library is the pattern: `ImageTemplatePayload`
(`template-types.ts:37-43`) + `applyImageTemplate` (`template-service/apply.ts:20-31`)
+ CRUD in `template-service/crud.ts` + `TemplateModality.Video` already in the
enum (`src/db/enums-generation.ts:78-87`). Video payloads today fall through to
the freeform `SimpleTemplatePayload` (`template-types.ts:44-48`) with no
temporal structure. FEAT-065-sub-video defines the target: model families
(Wan, LTX, SVD, AnimateDiff, Mochi, HunyuanVideo), prompt formats (natural /
keyframe-tags / json), variables (`subject motion style duration aspectRatio
cameraMovement negativePrompt`), detail levels (instant/balanced/detailed),
gen modes (`text2video image2video scene last`). The video route
(`TASK-video-gen-route.md`) consumes this: `templateId` + `context` render
through it, non-video modality rejected 400.

## Acceptance Criteria

+ [ ] `VideoPromptTemplatePayload` type with family, format, mode, detail,
  and the seven temporal variables; `parseTemplatePayload` handles `video`
  modality (today it falls to `SimpleTemplatePayload` at `template-types.ts:146-147`)
+ [ ] `src/generation/video-prompt-templates.ts` exports `resolveTemplate()`,
  `resolveProfile()`, `buildVideoPromptMessages()` mirroring the
  `prompt-templates/` structure (config/index/messages/profiles/resolution/templates/types)
+ [ ] Migration adds `video_prompt_templates` table (forward-only new file;
  never edit `001_init`)
+ [ ] CRUD API: create/list return 200; apply renders `{{variables}}`
  (unknown vars render empty, image precedent `apply.ts:29`); 501 on apply
  until a video provider lands
+ [ ] Unit tests: template resolution, variable substitution, detail-level
  token budgets — mirroring `prompt-templates.test.ts`
