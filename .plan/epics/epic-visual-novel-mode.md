<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Visual Novel Mode — Dynamic Generation & Q&A Mode

**Overview:** Visual Novel Mode turns a chat into a cinematic scene-based
experience — full-screen backgrounds, character portraits, transitions,
typewriter text, and branching decisions. The renderer, the choices/story
generation backends, the chat-view wiring, the choice cards, the Q&A
interaction loop, scene templates at render time, the per-chat opt-in flag,
and the pending-decision send gate are all landed and live. What remains is
(a) choice and question impacts never reaching the relationship/mood systems
(and no `vn_choice_selections` history table), (b) dialogue-template
consumption plus the custom-template CRUD/GM-builder surface, and (c) dynamic
image generation, deferred to `epic-comfyui-plugin`. This epic
owns the remaining VN work; `epic-immersion-presentation` mirrors this epic's
state rather than tracking VN independently.

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

## Current State (verified 2026-10-18 against `src/` on `dev`)

Replaces the 2026-10-09 snapshot, which predated the `vn-mode-qa-loop`
landing: since then the choice cards, the Q&A interaction loop, scene
templates at render time, the opt-in flag, and the send gate all shipped.
Every ✅ below names the file that proves it.

### Landed and wired

- ✅ Base VN renderer — `src/frontend/vn/scene-renderer/` (controller,
  render-scene, stage, state), `portrait-manager.ts`,
  `transition-engine.ts`, `typewriter.ts`, `settings.ts`,
  `sprite-stage.ts`, `image-preloader.ts`, `choice-cards.ts` +
  `choice-cards-render.ts`, `question-cards.ts` +
  `question-cards-render.ts`. `render-scene.ts` imports
  `transitionScene` and `typewrite` directly.
- ✅ Chat view wiring — `src/views/chat.html:36` `#vn-container`
  (`data-testid="vn-container"`); `src/frontend/alpine/chat-settings/vn.ts`
  `syncVnRenderer` rebuilds the renderer from persisted `gm_config`.
  `chats.visual_novel` was dropped in migration 076; the live source of
  truth is `gm_config.renderingOverride` (`ChatRenderingOverride`).
- ✅ Branching choices backend — `GET /api/chats/:id/vn-choices` and
  `POST /api/chats/:id/vn-choices/:choiceId/select`
  (`src/routes/chats/vn-choices.ts`, mounted in `src/routes/chats/index.ts:61`),
  backed by the `vn_choices` table (`src/db/schema-manifest.ts:1153`).
  Route tests cover list + select + participant auth.
- ✅ Story generation — `POST /api/chats/:id/vn/generate-story`
  (`src/routes/vn-generate/story.ts`), mounted via `vnGenerateRoutes` at
  `src/routes/v1/chats-surface.ts:51`.
- ✅ Choice generation — `POST /api/chats/:id/vn/generate-choices`
  (`src/routes/vn-generate/choices.ts`), same mount.
- ✅ Choice cards UI — `render-scene.ts:251` calls `initChoiceCards` on the
  per-scene `.vn-choices-container` and fires `loadChoices()`, gated on
  `settings.vnChoicesEnabled` (the previous "never called" gap is closed).
- ✅ Q&A interaction loop — `POST /api/chats/:id/vn/generate-questions`
  (`src/routes/vn-generate/questions.ts`, persists to the `vn_questions`
  table), `GET /api/chats/:id/vn-questions?sceneIndex=N`,
  `POST .../vn-questions/:questionId/answer`, and
  `POST .../vn-questions/:questionId/dismiss`
  (`src/routes/chats/vn-questions.ts`, mounted in
  `src/routes/chats/index.ts`); `render-scene.ts` calls
  `initQuestionCards`/`loadQuestions` alongside the choice path, and
  `scene-renderer/controller.ts` calls `destroyQuestionCards()` on teardown.
- ✅ Scene templates at render time — `render-scene.ts` imports
  `applyTemplateOverrides` (`src/frontend/vn/templates/apply.ts`) and
  `scene-renderer/render.ts` imports `evaluateTriggers`
  (`templates/transition-triggers.ts`); scenes carry
  `templateId`/`templateVars` (`scene-renderer/types.ts`).
- ✅ Per-chat VN choice opt-in flag — `vnChoicesEnabled` in `gm_config`
  (`src/chat/types/config.ts`, allowlisted on both the backend
  `src/chat/service/access.ts` and frontend
  `src/frontend/alpine/chat-settings/gm-config-presentation.ts` sides,
  default off; `getVnSettings` never leaks it across chats via
  localStorage).
- ✅ Pending-decision send gate — `src/routes/messages/guards.ts` rejects
  free-text send with a 409 while an unresolved `vn_choices` or
  `vn_questions` row exists for the chat (choice and question variants,
  both with a dismiss path).

### Built but unwired

- ⚠️ QA validator — `src/frontend/vn/qa-mode.ts` exports `runQaCheck` /
  `renderQaReport` with unit tests. This is a **static content
  validator**, not the Q&A interaction loop. Grep across `src/` returns
  only `qa-mode.ts` and `qa-mode.test.ts` — no chat view or route
  consumes it.
- ⚠️ Choice/question consequences — `relationship_impact`, `mood_impact`,
  and `unlock_conditions` are columns on `vn_choices` (and the matching
  columns on `vn_questions`) and are parsed by `chat/service/vn-choices.ts`
  / `vn-question-parse.ts`, but `getAccumulatedImpacts()` has no
  production consumer and no code writes to the relationship or mood
  systems (`chat/service/vn-questions.ts` documents the deferral:
  `updateRelationship`/`updateMood` need a service locator the VN routes
  do not carry). The `vn_choice_selections` table named by the ticket's
  choice-history AC does not exist.
- ⚠️ Custom template surface — `templates/template-engine.ts` variable
  resolution is wired via `apply.ts`, but the localStorage CRUD
  (`saveTemplate`/`deleteTemplate`/`getTemplatesForWorld`), JSON
  import/export, `search.ts`, composites, and conditions/delays have no
  production caller and no GM builder UI; dialogue templates
  (`DIALOGUE_TEMPLATES`) are still not consumed by the renderer.

### Not started

- ❌ Text-to-VN importer — no importer, parser, or segmentation code.
- ❌ Dynamic image generation — deferred to `epic-comfyui-plugin`;
  `POST /api/chats/:id/vn/generate-image` does not exist.

## Opt-in + pending-choice gate (shipped)

The extension gap this section used to describe is closed:

- `vnChoicesEnabled` is a per-chat `gm_config` flag, default off; a chat
  that has not opted in never mounts choice/question cards and never
  fetches them (`render-scene.ts` gates on the overlaid settings).
- While a choice or question is pending, the message-create guards reject
  free-text send with a 409 naming the pending decision; resolving or
  dismissing it from the card releases the gate
  (`destroyChoiceCards`/`destroyQuestionCards` clear the pending flag).

## Remaining Scope — branch `vn-epic-completion` (2026-10-18)

Reconciliation source: the 2026-10-18 review adjudication of the VN cluster.
The five VN tickets whose `**Status:**` header said `Done` while their own
body notes said "corrected Done → In Progress" (template-actions,
scene-template-system, qa-mode, branching-choices, dynamic-generation) are
re-synced to `In Progress` on this branch; the code inventory itself was
already truthful.

Tracking-system caveat: the ticket registry still carries these five issues
as closed. Re-opening them via `giwt state` does not hold — the shared
registry's sync enforcement auto-closes a done-index ticket's open issue as
stale on the next `giwt sync --fix` by any agent, so `plan:sync` reports
these five as ".md status stale" until the registry is re-opened deliberately
at review (one source of truth still needs picking; this branch picks the
truthful .md status and leaves the registry decision to the reviewer).

### What is DONE

`## Current State` above carries the full landed inventory with file anchors:
renderer, chat-view wiring, choices backend + mounted cards, the Q&A
interaction loop, scene templates at render time (`templates/apply.ts` via
`render-scene.ts`), transition triggers (`render.ts`), the per-chat opt-in
flag, and the pending-decision send gate.

### What remains — implementable now (this branch's slice)

**Update 2026-10-18 (branch landing):** all four items below landed on
`vn-epic-completion`; the bullets keep their original wording for the
record, with the landed anchors appended.

1. Composite template execution — `VnCompositeStep` is interface-only
   (`templates/template-engine.ts`); no executor, no condition evaluation,
   no step delay anywhere in `src/`.
   **Landed:** `templates/composite.ts` (`compositeStepsOf`,
   `evaluateCondition`, `executeCompositeSteps` — 15 tests) orchestrated
   pre-mount by `render-scene.ts` `applyCompositeSettings` with a run-token
   stale-mount guard (composite block in `render-scene.test.ts`).
   Deviation recorded on `TASK-vn-scene-template-system.md`: single-mount
   fold, not per-beat re-animation.
2. Dialogue-template consumption — `typewriter.ts` reads only
   `settings.typewriterSpeed`; `DIALOGUE_TEMPLATES` pacing is never consumed.
   **Landed:** `typewriter.ts` `resolveDialoguePacing` (scene body text,
   dialogue body text, custom store via `worldId`; fail-closed) consumed by
   the `typewrite` call in `render-scene.ts` (+5 tests).
3. QA validator production caller — `runQaCheck`/`renderQaReport`
   (`src/frontend/vn/qa-mode.ts`) are imported only by their own test.
   **Landed:** `vnQaActions.runVnQaCheck` in
   `alpine/chat-settings/vn.ts` (spread into `chatSettings`), mounted in the
   chat settings modal VN section (`vn-qa-run` button + `vn-qa-report`
   container); `chat-settings/vn-qa.test.ts`.
4. Custom-template CRUD callers — `saveTemplate`/`deleteTemplate`/
   `getTemplatesForWorld`/`exportTemplate`/`importTemplate` have no
   production caller and no GM-facing surface.
   **Landed:** `alpine/vn-templates.ts` `vnTemplateManagerFactory` +
   `components/chat/vn-templates-panel.html` in the chat settings modal
   (list / save-import / export / delete; `vn-templates.test.ts`);
   `worldId` threading `updateVnMode` → `syncVnRenderer` →
   `initVnRenderer` → `state.currentWorldId` makes the store resolvable at
   render time (`apply.test.ts` custom-store cases).

With all four landed, the branch definition of done below is met; the five
tickets stay `In Progress` for their remaining ticket-specific scope
(picker/preview/builder UIs, write-back ACs, `nextSceneId` follow-up,
generation-side work).

### What stays out of this branch (recorded blockers)

- Choice/question impact write-backs to the relationship/mood systems and the
  `vn_choice_selections` history table — blocked on the un-defer trigger
  recorded in `TASK-vn-qa-mode.md` (service locator reachability in the VN
  routes AND create-or-update semantics in `updateRelationship`/
  `updateMood`).
- Dynamic image generation — owned by `epic-comfyui-plugin`.
- Text-to-VN importer — no code; tracked by its own ticket.
- The full GM template builder (drag-and-drop editor, preview, gallery,
  variable autocomplete) — the CRUD surface in item 4 is the smallest real
  slice; the builder remains open on `TASK-vn-scene-template-system.md`.

### Definition of done for this branch

- A composite template referenced by a scene's `templateId` renders through
  the existing `applyTemplateOverrides` path: steps apply sequentially,
  step conditions gate application, step delays are honoured, and
  non-composite templates keep today's behaviour unchanged.
- `typewriter.ts` consumes dialogue-template pacing (speed + punctuation
  pauses) when the scene's template chain names a dialogue style.
- `runQaCheck` has a production consumer on a GM-facing surface.
- Custom-template save/import/export/delete are reachable from a GM-facing
  surface (chat settings modal, VN section).
- Every behaviour above ships with unit tests; `bun run plan:validate`
  stays green for the touched `.plan/` files.

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
on 2026-10-18.

### Landed

- [x] VN scene renderer renders messages as scenes and is mounted in the chat
      view (`scene-renderer/`, `src/views/chat.html:36` `#vn-container`)
- [x] Branching choices are served, stored, selectable end-to-end at the API
      layer (`vn-choices.ts` routes, mounted at `routes/chats/index.ts:61`,
      backed by the `vn_choices` table)
- [x] Story and choice generation endpoints are reachable from the v1 surface
      (`vn-generate/index.ts` mounts `storyRoutes` + `choicesRoutes` +
      `questionsRoutes`)
- [x] Choice cards are mounted at render time: `render-scene.ts` calls
      `initChoiceCards` + `loadChoices()` on the per-scene
      `.vn-choices-container`, gated on `settings.vnChoicesEnabled`.
- [x] Q&A interaction loop is wired end-to-end: `generate-questions` +
      `vn-questions` routes are mounted, question cards render in the VN
      scene behind the same opt-in flag, and answer/dismiss are served
      (`src/routes/chats/vn-questions.ts`).
- [x] Templates are consumed at render time: `render-scene.ts` applies
      `applyTemplateOverrides` and `render.ts` evaluates transition
      triggers from the template registry.
- [x] Per-chat VN choice opt-in flag exists (`vnChoicesEnabled`) and
      defaults to off; a chat that has not opted in never shows choice UI.
- [x] Send is blocked while a choice or question is pending, until the
      player resolves or explicitly dismisses it
      (`src/routes/messages/guards.ts` 409 path).

### Open — this is what the epic is carrying

- [ ] Choice/question consequences reach the systems they claim to affect.
      `relationship_impact` / `mood_impact` / `unlock_conditions` are parsed off
      the rows, but `getAccumulatedImpacts()` has no production
      consumer; nothing writes to the relationship or mood systems (the
      service locator the write-back needs is absent from the VN routes).
      There is no `vn_choice_selections` table — the choice-history AC names
      one that was never created.
- [ ] Custom template surface is consumable end-to-end: the localStorage
      CRUD, JSON import/export, search, composites, and conditions/delays
      have no production caller and no GM builder UI, and dialogue
      templates are still not consumed by the renderer.

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
| `TASK-vn-branching-choices.md` | In Progress | Routes, table, card mounting, and send gate all live; impacts never reach the relationship/mood systems and there is no `vn_choice_selections` table |
| `TASK-vn-dynamic-generation.md` | In Progress | Story, choice, and question generation all shipped and mounted; all image-generation ACs deferred to `epic-comfyui-plugin` |
| `TASK-vn-qa-mode.md` | In Progress | Q&A interaction loop shipped (generate/list/answer/dismiss + question cards); impact write-backs deferred and `qa-mode.ts` still callerless |
| `TASK-vn-template-actions.md` | In Progress | Scene templates and transition triggers wired at render time; dialogue templates and the picker UI remain open |
| `TASK-vn-scene-template-system.md` | In Progress | `applyTemplateOverrides` wired via `render-scene.ts`; custom CRUD, composites, conditions/delays, and the GM builder UI remain open |
| `TASK-vn-choice-opt-in.md` | In Progress | `vnChoicesEnabled` flag and the pending-decision send gate shipped; consequence application shared with the branching-choices gap |
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
