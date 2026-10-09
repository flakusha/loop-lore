<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Visual Novel Mode — Dynamic Image & Story Generation

**Effort:** Medium
**Summary:** LLM-generated story inside VN scenes — the scene description for an
unexplored location and the narrative beat between chat turns. Image generation
is a separate, deferred half of this ticket (see `## Deferral`).
**Context:** Extends `TASK-visual-novel-mode.md` (renderer) and
`TASK-vn-branching-choices.md` (choices). See `## Description`,
`## How It Extends Existing Work`, `## Scope Clarification`, and
`## Technical Notes`.
**Acceptance Criteria:** The list in `## Acceptance Criteria`, split by what is
actually built vs what is deferred. See `## Deferral` for why the image-gen
boxes stay open rather than being dropped.
**Priority:** Medium
**Status:** In Progress
**Status Note:** (2026-08-23) marked Done with 6 unchecked ACs. Reconciled 2026-10-09: the story route is real and mounted, but the image-generation half and the frontend story overlay have no code — status corrected Done → In Progress. The closed git issue is left as-is; re-opening it is out of scope here.
**Epic:** epic-visual-novel-mode
**Tags:** visual-novel, dynamic-image, story-generation, image-gen, llm

## Description

Add dynamic image and story generation to Visual Novel Mode. When a VN scene is active, the system can automatically generate images for locations, characters, and events using the existing image generation pipeline (ComfyUI/SD). Story generation fills in scene descriptions and narrative bridges dynamically.

## How It Extends Existing Work

Builds on `TASK-visual-novel-mode.md` (base VN rendering, backend complete) and `TASK-vn-branching-choices.md` (branching choices). Adds dynamic generation on top of the existing VN infrastructure.

## Acceptance Criteria

### Shipped

- [x] `POST /api/chats/:id/vn/generate-story` route — `src/routes/vn-generate/story.ts:137`, mounted via `vn-generate/index.ts:27` and `routes/v1/chats-surface.ts:51`
- [x] Story description generation for unexplored locations — same route; the prompt is assembled with purpose `vn` / task `vn-story` (`story.ts:57-62`)
- [x] Narrative bridge / atmosphere story text generation — the same `generate-story` endpoint returns the narrative beat; VN prompts are registered under the `vn` and `vn-story` purposes (`src/prompts/purposes.ts:27-28`)

### Deferred to epic-comfyui-plugin

- [ ] `POST /api/chats/:id/vn/generate-image` route
- [ ] Location-scene auto-generation (VN background images per location)
- [ ] Character portrait generation from character data
- [ ] Mood-based image variation (character expressions change with mood)
- [ ] Event-triggered image generation (combat, weather, special moments)
- [ ] Image caching — pre-generate and cache common scene images
- [ ] Config: image generation model selection per world
- [ ] Frontend VN scene renderer with dynamic image loading

### Still open on this epic (no ComfyUI needed)

- [ ] Frontend story overlay with generated narrative text — grep for `generate-story` / `vn-story` under `src/frontend/` returns nothing; no overlay component consumes the endpoint
- [ ] Config: enable/disable dynamic generation per world/chat — no such flag in `gm_config` or the chats schema

## Scope Clarification (2026-08-23)

This ticket covers **dynamic generation** only. The Q&A interaction loop (question-card display, answer routing, consequence application) is out of scope here — see `TASK-vn-qa-mode.md` (its ⬜ Q&A Interaction Loop section tracks that scope). The Q&A backend routes listed in earlier drafts of this ticket are not wired in `src/routes/vn-generate/index.ts` and are not part of this ticket's deliverable.

## Technical Notes

- Uses existing ComfyUI plugin infrastructure (`epic-comfyui-plugin.md`) for image generation
- Story generation uses the existing LLM pipeline with VN-specific prompt templates
- Image caching uses the existing asset storage system
- Mood-based variation uses the existing mood/emotion hook system
- Integrates with Character Core System for portrait generation from character data
- Integrates with World & Locations for location-scene generation


## Deferral (2026-10-09)

The image-generation half of this ticket is **deferred to `epic-comfyui-plugin`**,
not cancelled. The boxes above stay `[ ]` on purpose so the scope is not lost
when the ticket is picked up again.

Why deferred: every image-gen box needs a working ComfyUI workflow
invocation surface, and `epic-comfyui-plugin.md` owns that surface. It has
already booked the un-defer as its own scoped item — "ComfyUI un-defer of VN
dynamic image generation", VN story image step via `generateComfyUI` /
`pickSdProvider`, `(scene_hash, emotion)` cache, backend-down fallback (git
issue `008910d`, tagged `epic-visual-novel-mode`). Building a VN image route
here first would mean hand-rolling a second path to the same pipeline.

What this epic still owes independently of ComfyUI (tracked under "Still open
on this epic" above): the frontend story overlay that consumes
`/vn/generate-story`, and a per-world/chat toggle for dynamic generation.
Those do not need ComfyUI and can land now.
