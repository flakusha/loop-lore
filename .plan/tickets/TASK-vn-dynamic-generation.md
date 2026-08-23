<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Visual Novel Mode — Dynamic Image & Story Generation

**Priority:** Medium
**Status:** 🟡 Partial Complete — Story generation ✅, Image generation deferred, Q&A routes not in this ticket
**Epic:** epic-visual-novel-mode
**Tags:** visual-novel, dynamic-image, story-generation, image-gen, llm

## Description

Add dynamic image and story generation to Visual Novel Mode. When a VN scene is active, the system can automatically generate images for locations, characters, and events using the existing image generation pipeline (ComfyUI/SD). Story generation fills in scene descriptions and narrative bridges dynamically.

## How It Extends Existing Work

Builds on `TASK-visual-novel-mode.md` (base VN rendering, backend complete) and `TASK-vn-branching-choices.md` (branching choices). Adds dynamic generation on top of the existing VN infrastructure.

## Acceptance Criteria

- [ ] Location-scene auto-generation (generate VN background images per location)
- [ ] Character portrait generation from character data (name, description, personality)
- [ ] Mood-based image variation (character expressions change with mood state)
- [ ] Event-triggered image generation (combat, weather, special moments)
- [ ] Image caching — pre-generate and cache common scene images
- [x] Story description generation for unexplored locations
- [x] Narrative bridge generation between chat turns in VN mode
- [x] Atmosphere/ambient story text generation
- [ ] `POST /api/chat/:id/vn/generate-image` route (deferred — uses ComfyUI)
- [x] `POST /api/chat/:id/vn/generate-story` route
- [ ] Frontend VN scene renderer with dynamic image loading
- [x] Frontend story overlay with generated narrative text
- [ ] Config: enable/disable dynamic generation per world/chat
- [ ] Config: image generation model selection per world

## Scope Clarification (2026-08-23)

This ticket covers **dynamic generation** only. The Q&A interaction loop (question-card display, answer routing, consequence application) is out of scope here — see `TASK-vn-qa-mode.md` and the planned follow-up `TASK-vn-question-answer-interaction.md`. The Q&A backend routes listed in earlier drafts of this ticket are not wired in `src/routes/vn-generate/index.ts` and are not part of this ticket's deliverable.

## Technical Notes

- Uses existing ComfyUI plugin infrastructure (`epic-comfyui-plugin.md`) for image generation
- Story generation uses the existing LLM pipeline with VN-specific prompt templates
- Image caching uses the existing asset storage system
- Mood-based variation uses the existing mood/emotion hook system
- Integrates with Character Core System for portrait generation from character data
- Integrates with World & Locations for location-scene generation
