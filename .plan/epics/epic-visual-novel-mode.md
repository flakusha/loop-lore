<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Visual Novel Mode — Dynamic Generation & Q&A Mode

**Overview:** Visual Novel Mode turns a chat into a cinematic scene-based
experience — full-screen backgrounds, character portraits, transitions,
typewriter text, and branching decisions. The renderer, the choices and
story-generation backends, and the chat-view wiring are landed and live. As of
2026-10-09 three more gaps closed on branch `vn-mode-qa-loop`: the choice cards
are mounted at render time, the Q&A interaction loop exists end-to-end (routes,
service, `vn_questions` table, question cards), and scene templates are consumed
via `templates/apply.ts`. What remains is (a) per-chat opt-in and the
pending-choice send gate, (b) choice and question consequences never reaching
the relationship/mood systems, (c) the rest of the template engine (composites,
conditions/delays, dialogue templates, GM builder UI), and (d) dynamic image
generation, deferred to `epic-comfyui-plugin`. This epic owns the remaining VN
work; `epic-immersion-presentation` mirrors this epic's state rather than
tracking VN independently.

**Status:** In Progress
**Priority:** Medium
**Effort:** Very High
**Type:** Feature Epic
**Tags:** visual-novel, dynamic-image, story-generation, qa-mode, chat-mode
**Depends on:** `epic-immersion-presentation` (VN presentation surface),
`epic-character-core-system` (portraits, relationship + mood modifiers),
`epic-chat-lifecycle-moderation` (turn lifecycle behind the send gate),
`epic-comfyui-plugin` (deferred image generation)

## Summary

Extend Visual Novel Mode with dynamic image and story generation capabilities, plus a question<->answer chat mode that supports VN-style interactive storytelling. Builds on the existing Visual Novel Mode backend (completed) and branching choices task.

## How It Extends Existing Work

All eight tickets below are part of this epic; `## Tasks` carries each one's
verified state.

- `TASK-visual-novel-mode.md` — base VN rendering (Done)
- `TASK-vn-branching-choices.md` — branching choices with relationship impact
- `TASK-vn-dynamic-generation.md` — dynamic image/story generation
- `TASK-vn-qa-mode.md` — question<->answer VN mode
- `TASK-vn-template-actions.md` — pre-configured scene/dialogue templates
- `TASK-vn-scene-template-system.md` — custom template engine
- `TASK-vn-choice-opt-in.md` — per-chat opt-in + pending-choice send gate
- `TASK-text-to-visual-novel-importer.md` — TXT/MD/PDF to VN importer

## Current State (verified 2026-10-09 against `src/` on `dev`)

Replaces the 2026-07-31 snapshot, which claimed ✅ Complete for template
systems and QA mode that are not actually wired. Every ✅ below names
the file that proves it.

### Landed and wired

- ✅ Base VN renderer — `src/frontend/vn/scene-renderer/` (controller,
  render-scene, stage, state), `portrait-manager.ts`,
  `transition-engine.ts`, `typewriter.ts`, `settings.ts`,
  `sprite-stage.ts`, `image-preloader.ts`, `choice-cards.ts` +
  `choice-cards-render.ts`. `render-scene.ts` imports
  `transitionScene` and `typewrite` directly.
- ✅ Chat view wiring — `src/views/chat.html:36` `#vn-container`
  (`data-testid="vn-container"`); `src/frontend/alpine/chat-settings/vn.ts`
  `syncVnRenderer` rebuilds the renderer from persisted `gm_config`.
  The live source of truth is `gm_config.renderingOverride`
  (`ChatRenderingOverride`, `src/db/enums-core/chat.ts:30`). There is no
  `chats.visual_novel` column — `visual_novel` appears in `src/db` only as
  that enum value (corrected 2026-10-09: an earlier revision of this epic
  cited a "migration 076" that dropped the column; no such migration
  exists — migrations end at `046_mesh_outbox_chat_id.ts`).
- ✅ Branching choices backend — `GET /api/chats/:id/vn-choices` and
  `POST /api/chats/:id/vn-choices/:choiceId/select`
  (`src/routes/chats/vn-choices.ts`, mounted in `src/routes/chats/index.ts:57`),
  backed by the `vn_choices` table (`src/db/schema-manifest.ts:1018`).
  Route tests cover list + select + participant auth.
- ✅ Story generation — `POST /api/chats/:id/vn/generate-story`
  (`src/routes/vn-generate/story.ts:137`), mounted at
  `src/routes/v1/chats-surface.ts:51`.
- ✅ Choice generation — `POST /api/chats/:id/vn/generate-choices`
  (`src/routes/vn-generate/choices.ts:144`), same mount.

### Built but unwired

- ⚠️ QA validator — `src/frontend/vn/qa-mode.ts` exports `runQaCheck` /
  `renderQaReport` with unit tests. This is a **static content
  validator**, not the Q&A interaction loop. Grep across `src/` returns
  only `qa-mode.ts` and `qa-mode.test.ts` — no chat view or route
  consumes it.
- ⚠️ Choice consequences — `relationship_impact`, `mood_impact`, and
  `unlock_conditions` are columns on `vn_choices` and are parsed by
  `chat/service/vn-choices.ts`, but `getAccumulatedImpacts()` has no
  production consumer and no code writes to the relationship or mood
  systems. The `vn_choice_selections` table named by the ticket's
  choice-history AC does not exist.
- ⚠️ Template engine extras — `src/frontend/vn/templates/template-engine.ts`
  (variable resolution, inheritance, localStorage CRUD, JSON import/export)
  is now read at render time via `templates/apply.ts`, but only for the
  `layout` / `imageScaling` / `transition` / `typewriterSpeed` subset of
  `body`. Composite execution, conditional steps, step delays, variable
  type validation, and the GM builder/gallery UI remain absent.
  `transition-triggers.ts` (`evaluateTriggers`) still has no caller.

### Not started

- ❌ Per-chat VN choice opt-in flag — no opt-in field exists. VN
  rendering has `gm_config.renderingOverride`, but choices themselves are
  always on. Grep for `vnChoices`/`choicesEnabled`/`pendingChoice` in
  `src/` returns only the `vnChoices` prompt-template section, not a flag.
- ❌ Pending-choice send gate — nothing blocks free-text send while a
  choice or question is unresolved.
- ❌ Choice / question consequences applied to character systems — both
  services return impacts to the caller rather than writing to the
  relationship or mood services.
- ❌ Text-to-VN importer — no importer, parser, or segmentation code.
- ❌ Dynamic image generation — deferred to `epic-comfyui-plugin`;
  `POST /api/chats/:id/vn/generate-image` does not exist.

### Landed after this epic's first pass (branch `vn-mode-qa-loop`)

Three previously-open gaps closed. Verified against `vn-mode-qa-loop` at
`e87bd19c0` / `5e5af1d81`, not against this branch:

- ✅ Choice cards mounted at render time — `render-scene.ts:232` calls
  `initChoiceCards(choicesEl, …)` and `:233` `loadChoices()` on the
  `.vn-choices-container` the renderer already built.
- ✅ Q&A interaction loop built end-to-end — migration
  `047_vn_questions.ts` (`vn_questions`), service
  `src/chat/service/vn-questions.ts`, routes
  `src/routes/chats/vn-questions.ts` (`GET …/vn-questions`,
  `POST …/vn-questions/:questionId/answer`, both `checkChatAccess`-guarded),
  generation in `src/routes/vn-generate/questions.ts`, and
  `src/frontend/vn/question-cards.ts` + `question-cards-render.ts` wired at
  `render-scene.ts:238-239`. Options are native `<button>` elements, so
  tab/enter selection and focus order come from the platform.
- ✅ Templates consumed at render time — `render-scene.ts:202` calls
  `applyTemplateOverrides(baseSettings, scene)` from
  `src/frontend/vn/templates/apply.ts`, which resolves the scene's
  `templateId` against the built-in registry and merges the whitelisted
  overrides. Fails closed to base settings on a thrown `resolveVariables`
  or an out-of-union value.

## Opt-in + pending-choice gate (extension gap)

- Branching choices exist today: `POST /api/chats/:id/vn/generate-choices`
  produces options backed by the `vn_choices` table and rendered by
  `src/frontend/vn/choice-cards.ts` — but they are always on, with no
  per-chat opt-in flag to disable them.
- Send is never blocked by pending choices: a player can talk past an
  unresolved decision point and leave it dangling.
- Extension design (→ `TASK-vn-choice-opt-in`):
  - per-chat opt-in flag for choice prompts;
  - send blocked until a pending choice is resolved or explicitly dismissed;
  - choices framed as ask-tool-like decisions that consume a beat when taken.

## Core Features

### Dynamic Image Generation

- Location-scene auto-generation (generate images for each location/scene)
- Character portrait generation from character data
- Mood-based image variation (character expressions change with mood)
- Event-triggered image generation (combat, weather, special moments)
- Image caching and pre-generation for common scenes

### Dynamic Story Generation

- Scene description auto-generation for unexplored locations
- Narrative bridge generation between chat turns
- Atmosphere/ambient story text generation
- Lore-consistent story continuation
- Genre/style-aware story generation

### Q&A Mode (Question <-> Answer)

- Structured Q&A interaction pattern within VN scenes
- Player questions trigger character responses with emotion/expression changes
- Answer-driven scene branching (different answers lead to different scenes)
- Question types: lore, relationship, combat, exploration, social
- Answer scoring and consequence tracking
- Q&A session persistence across chat turns

### Combined Mode

- VN scenes with both dynamic generation AND Q&A interaction
- Scene transitions triggered by Q&A outcomes
- Dynamic images update based on Q&A choices
- Story generation adapts to Q&A context

## Design

### Dynamic Generation Pipeline

```
Scene Trigger → Context Analysis → Image Generation → Story Generation → VN Rendering
```

### Q&A Mode Structure

```typescript
interface VNQuestion {
  id: string;
  scene_id: string;
  question_type: "lore" | "relationship" | "combat" | "exploration" | "social";
  question_text: string;
  options: VNQuestionOption[];
  next_scene_id: string;
  consequences: VNConsequence[];
}

interface VNQuestionOption {
  id: string;
  text: string;
  emotion_modifier: number;
  relationship_modifier: number;
  next_scene_id: string;
}

interface VNConsequence {
  type: "scene_change" | "mood_shift" | "relationship_change" | "item_gain" | "location_change";
  target: string;
  value: number;
}
```

## Acceptance Criteria

Epic is complete when every box below is checked. Verified against `src/`
on 2026-10-09.

### Landed

- [x] VN scene renderer renders messages as scenes and is mounted in the chat
      view (`scene-renderer/`, `src/views/chat.html:36` `#vn-container`)
- [x] Branching choices are served, stored, selectable end-to-end at the API
      layer (`vn-choices.ts` routes, mounted at `routes/chats/index.ts:57`,
      backed by the `vn_choices` table)
- [x] Story and choice generation endpoints are reachable from the v1 surface
      (`vn-generate/index.ts` mounts `storyRoutes` + `choicesRoutes`)

### Open — this is what the epic is carrying

- [x] Choice cards are mounted at render time — `render-scene.ts:232` calls
      `initChoiceCards(choicesEl, …)` and `:233` `loadChoices()` on the
      `.vn-choices-container` the renderer builds per scene. (Landed on
      `vn-mode-qa-loop` at `e87bd19c0`.) Caveat: mounting is not
      consequence application — see the last box in this section.
- [x] Q&A interaction loop is wired end-to-end — `GET …/vn-questions` +
      `POST …/vn-questions/:questionId/answer` (`src/routes/chats/vn-questions.ts`,
      `checkChatAccess`-guarded) over the `vn_questions` table (migration
      `047_vn_questions.ts`), generation in
      `src/routes/vn-generate/questions.ts`, and a question card mounted at
      `render-scene.ts:238-239` that lists and answers. Answering returns the
      option's impacts to the caller. (Landed on `vn-mode-qa-loop` at
      `e87bd19c0` / `5e5af1d81`.)
- [x] Templates are consumed at render time — `render-scene.ts:202` calls
      `applyTemplateOverrides` (`src/frontend/vn/templates/apply.ts`), which
      resolves the scene's `templateId` against the built-in registry and
      merges `layout` / `imageScaling` / `transition` / `typewriterSpeed`.
      (Landed on `vn-mode-qa-loop` at `e87bd19c0`.) Partial: no composites,
      no conditional steps, no trigger evaluation at render time.
- [ ] Per-chat VN choice opt-in flag exists and defaults to off, so a chat
      that has not opted in never shows choice UI. No such field exists today.
- [ ] Send is blocked while a choice is pending, until the player resolves or
      explicitly dismisses it. Nothing gates free-text send on a pending
      choice today — and now also not on a pending question.
- [ ] Choice consequences reach the systems they claim to affect.
      `relationship_impact` / `mood_impact` / `unlock_conditions` are parsed off
      the row and summed by `getAccumulatedImpacts()`, which has no production
      consumer; nothing writes to the relationship or mood systems. The same
      holds for the question side: `answerVnQuestion` returns impacts rather
      than applying them. There is no `vn_choice_selections` table — the
      choice-history AC names one that was never created.

### Deferred — tracked, not blocking

- [ ] Dynamic image generation (`generate-image`, per-location scenes,
      portrait generation, mood variation, caching). Depends on
      `epic-comfyui-plugin`; ownership is not this epic's.
- [ ] Text-to-VN importer (TXT/MD/PDF ingestion, scene segmentation,
      character extraction). No code exists.

## Tasks

| Ticket | Status | One-line state |
| ------ | ------ | -------------- |
| `TASK-visual-novel-mode.md` | Done | Base renderer, chat-view wiring, settings — verified in `src/frontend/vn/scene-renderer/` and `src/views/chat.html` |
| `TASK-vn-branching-choices.md` | In Progress | Routes, table, and card UI all exist and the cards are now mounted at render time (`render-scene.ts:232`); choice impacts still never reach the relationship/mood systems and there is no choice-history table |
| `TASK-vn-dynamic-generation.md` | In Progress | Story generation shipped and mounted; all image-generation ACs deferred to `epic-comfyui-plugin` |
| `TASK-vn-qa-mode.md` | In Progress | Q&A interaction loop built end-to-end on `vn-mode-qa-loop` (migration 047, service, guarded routes, `question-cards.ts` mounted at `render-scene.ts:238`); consequences are returned, not applied, and the static validator is still callerless |
| `TASK-vn-template-actions.md` | In Progress | Scene templates are now applied at render time via `templates/apply.ts`; dialogue templates and `evaluateTriggers` still have no consumer, and there is no picker UI |
| `TASK-vn-scene-template-system.md` | In Progress | Template engine shipped and its render-time subset is wired; composite execution, conditional steps, and the GM builder UI remain absent |
| `TASK-vn-choice-opt-in.md` | Not Started | No per-chat opt-in flag, no pending-choice send gate |
| `TASK-text-to-visual-novel-importer.md` | Not Started | No importer, parser, or segmentation code |

## Related

- Epic Immersion & Presentation (EPIC-048)
- Epic Character Core System (EPIC-047)
- Epic Chat Lifecycle & Moderation (EPIC-036)
- `TASK-visual-novel-mode.md` — base VN rendering
- `TASK-vn-branching-choices.md` — branching choices with relationship impact
- `TASK-vn-dynamic-generation.md` — dynamic image/story generation
- `TASK-vn-qa-mode.md` — Q&A mode for VN
- `TASK-vn-template-actions.md` — pre-configured scene/dialogue templates
- `TASK-vn-scene-template-system.md` — custom template engine with variables

## Linked Tasks

- TASK-visual-novel-mode.md
- TASK-vn-branching-choices.md
- TASK-vn-dynamic-generation.md
- TASK-vn-qa-mode.md
- TASK-vn-template-actions.md
- TASK-vn-scene-template-system.md
- TASK-vn-choice-opt-in.md
- TASK-text-to-visual-novel-importer.md


git issue: 96d6032
