<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN Q&A Mode

**Summary:** Question↔answer interaction inside VN scenes — a question card the
player answers, with the answer driving emotion, relationship, and scene
changes. The static QA validator half shipped; the interaction loop has no
implementation in `src/`.
**Context:** Two unrelated deliverables share this ticket. (1) A static content
validator for VN scenes — shipped, but with no production caller. (2) A Q&A
interaction loop — not started. See `## Status Split` and `## Scope`.
**Acceptance Criteria:** Split in `## Acceptance Criteria` — validator boxes
(verified in `src/frontend/vn/qa-mode.ts`) vs interaction-loop boxes (no code).


**Status:** In Progress
**Status Note:** (2026-08-23) marked Done while its own body said the Q&A Interaction Loop was NOT STARTED with 10 unchecked ACs. Reconciled 2026-10-09: validator done (but callerless), interaction loop absent — Done → In Progress. Note the closed git issue is left as-is; re-opening it is out of scope here.
**Status Note (2026-10-09):** Q&A interaction loop shipped (minimal, choices-parity). Three ACs remain deferred — mood shift / relationship change / item gain write-back — and one partial (`nextSceneId` is returned but no caller acts on it). The static QA validator still has no production caller. Status stays In Progress until the deferred ACs land; see `## Acceptance Criteria` for the un-defer trigger.
**Priority:** P2 — Medium
**Effort:** Medium
**Type:** Feature Task
**Tags:** visual-novel, qa-mode, interactive-storytelling
**Epic:** epic-visual-novel-mode

## Summary

Question<->Answer interaction mode within VN scenes. Player asks questions, characters respond with emotion/expression changes. Answers drive scene branching and consequence tracking. Builds on existing VN rendering (✅ complete).

## Status Split (2026-08-23)

This ticket covers two distinct deliverables — only the first is done.

### ✅ QA Validator (DONE)

`src/frontend/vn/qa-mode.ts` implements a static QA validator:

- Scene text / character / background completeness checks
- Consecutive narration pacing check
- `runQaCheck()` produces a report
- `renderQaReport()` surfaces issues to the GM

Not part of the Q&A interaction loop. **It also has no production caller**
(reconciled 2026-10-09): grep for `qa-mode`, `runQaCheck`, and
`renderQaReport` across `src/` returns only `qa-mode.ts` itself and
`qa-mode.test.ts`. The 2026-08-23 claim that it is "invoked by the chat panel /
GM tooling" does not hold — there is no import from any view, route, or panel.

### ✅ Q&A Interaction Loop (SHIPPED 2026-10-09 — minimal)

The question-card → answer pipeline now exists end to end:

- `GET /api/chats/:id/vn-questions?sceneIndex=N` — list available questions
- `POST /api/chats/:id/vn-questions/:qid/answer` — record an answer
- `POST /api/chats/:id/vn/generate-questions` — LLM generation (persists before returning)
- `src/frontend/vn/question-cards.ts` renders the cards and records the answer

`src/frontend/vn/qa-mode.ts` remains the **validator**; it was not repurposed.
Impacts are stored and returned, not written back to the character systems — see
the deferred ACs under `## Acceptance Criteria` for why.

## Scope

### Q&A Interaction Pattern

- Scene triggers a question (from script or LLM-generated)
- Question types: lore, relationship, combat, exploration, social
- Each question has 2-4 answer options
- Each option carries: text, emotion modifier, relationship modifier, next scene ID
- Answer selection triggers: scene transition, mood shift, relationship change, item gain, location change

### Data Model

```typescript
interface VNQuestion {
  id: string;
  scene_id: string;
  question_type: "lore" | "relationship" | "combat" | "exploration" | "social";
  question_text: string;
  speaker_id?: string; // who asks
  options: VNQuestionOption[];
  next_scene_id: string;
  consequences: VNConsequence[];
}

interface VNQuestionOption {
  id: string;
  text: string;
  emotion_modifier: number; // -100 to 100
  relationship_modifier: number; // -100 to 100
  next_scene_id: string;
  consequence?: VNConsequence;
}

interface VNConsequence {
  type: "scene_change" | "mood_shift" | "relationship_change" | "item_gain" | "location_change";
  target: string;
  value: number;
}
```

### Frontend

- Question card overlay in VN scene (Alpine.js component)
- Answer option buttons with hover preview (emotion/relation impact)
- Transition animation on answer selection
- Consequence notification (toast: "Relationship +10", "Item gained: Ancient Key")

### Backend

- `POST /api/chats/:id/vn/questions` — generate questions for current scene (LLM)
- `POST /api/chats/:id/vn/questions/:qid/answer` — record answer, apply consequences
- `GET /api/chats/:id/vn/questions` — list questions for current session
- Question generation uses scene context + character personalities + world state

### Combined Mode

- VN scenes can have both dynamic generation AND Q&A interaction
- Scene transitions triggered by Q&A outcomes
- Dynamic images update based on Q&A choices

## Backend Dependencies

| System | How Used |
|--------|----------|
| VN scene renderer (`src/frontend/vn/`) | Display questions within scenes |
| Character personality system | Generate character-appropriate questions/answers |
| Relationship system | Apply relationship modifiers |
| Mood system | Apply emotion modifiers |
| Item system | Grant items from consequences |

## Acceptance Criteria

### QA Validator — shipped

- [x] Static scene-content validator: blank text → error, missing character
      name → warning (narration exempt), missing background → info, text over
      2000 chars → warning, consecutive-narration pacing check
      (`src/frontend/vn/qa-mode.ts:36-122`, covered by `qa-mode.test.ts`)
- [x] `runQaCheck()` returns a `VnQaReport` with totals and per-issue severity
- [x] `renderQaReport()` renders the report into a container
- [ ] Validator is reachable from GM tooling — **no production caller**; the
      module is imported only by its own test

### Q&A Interaction Loop — shipped 2026-10-09 (minimal, choices-parity)

Implemented: migration `047_vn_questions`, service `src/chat/service/vn-questions.ts`,
routes `src/routes/chats/vn-questions.ts` + `src/routes/vn-generate/questions.ts`,
frontend `src/frontend/vn/question-cards{,-render}.ts`, mounted from
`scene-renderer/render-scene.ts`.

- [x] `POST /api/chats/:id/vn/generate-questions` route mounted
      (`src/routes/vn-generate/questions.ts`) — generates AND persists, so the
      list endpoint can read it back (the shipped BUG the choices path warns
      about). Prompt purpose `vnQuestions` registered in the LLM prompt
      registry, so the resolver does not fall back to an empty system prompt.
- [x] `GET /api/chats/:id/vn-questions?sceneIndex=N` — guarded by
      `checkChatAccess` + `serviceErrorToResponse`, so a non-participant gets
      404 (not 403) and a cross-chat question id is rejected
- [x] `POST /api/chats/:id/vn-questions/:qid/answer` — records the answer,
      returns the option's impacts
- [x] Question card displays in the VN scene with speaker + question text
- [x] Answer options show text + an impact preview rendered as text
      (`relationship_modifier`), so it is readable without a tooltip impl
- [x] Answering disables the options; the answer survives a failing side effect
      (each side effect has its own try/catch, matching `selectChoice`)
- [x] Q&A persists across chat turns — rows live in `vn_questions` keyed by
      `(chat_id, scene_index)`
- [x] Keyboard navigable — options are native `<button>` elements, so tab
      order and Enter activation come from the platform
- [x] Mobile responsive — flex-column card CSS in `src/public/css/vn.css`

**Deferred — impact application to the real systems.** The original ACs asked for
mood shift / relationship change / item gain to be written to the character
systems. That is NOT what this ships:

- [ ] Mood shift applied and visible in character portrait — **DEFERRED**.
      Impacts are stored on the row and returned; nothing writes them back.
- [ ] Relationship change applied and reflected in relationship system —
      **DEFERRED**, same reason.
- [ ] Item gain notification shown — **DEFERRED**, same reason.
- [ ] Selecting answer triggers scene transition — **PARTIAL**. The answer
      returns `nextSceneId`; no caller acts on it yet.

Why deferred: `updateRelationship` and `updateMood` both take a service locator
the VN routes do not carry, and both THROW when no row exists yet
(`write.ts:119-123`, `update-mood.ts:44-46`) — so a first answer with no prior
relationship row would break. The shipped `vn_choices` precedent stores impacts
and sums them in memory only; this matches it exactly.

**Un-defer trigger:** the VN routes gain access to the character service locator
AND `updateRelationship`/`updateMood` create-or-update instead of throwing on a
missing row. Both, not either.

### Choice card mount (shipped 2026-10-09)

- [x] `initChoiceCards` + `loadChoices` are called from `renderCurrentScene`;
      previously only `destroyChoiceCards` was wired, so branching choices
      rendered nothing at runtime

### Scene templates at render time (shipped 2026-10-09)

- [x] `src/frontend/vn/templates/apply.ts` applies a scene's template onto the
      effective settings, called at the top of `renderCurrentScene` so all five
      render paths funnel through it
- [x] Out-of-union template `transition` (`"fade-in"`, `"none"`) falls back to
      the base value — it would otherwise leave the scene at `opacity: 0`
      forever, since `transition-engine.ts` has no `default` case
- [x] A missing required template variable falls back instead of throwing
      (`resolveVariables` throws; `renderCurrentScene` has no handler)

## Files

Shipped paths (the list originally guessed `src/frontend/alpine/qa-mode.ts` and
`src/routes/vn-questions.ts`; neither was the right home):

- `src/frontend/vn/qa-mode.ts` — the **validator** (unchanged; never repurposed)
- `src/frontend/vn/question-cards.ts` + `question-cards-render.ts` — the
  question-card component (module-scope state, mirroring `choice-cards.ts`)
- `src/routes/chats/vn-questions.ts` — guarded list + answer routes, mounted
  from `chatsRoutes` alongside `vn-choices.ts`
- `src/routes/vn-generate/questions.ts` — LLM generation, mounted from
  `vn-generate/index.ts` alongside `storyRoutes`/`choicesRoutes`
- `src/chat/service/vn-questions.ts` — service layer
- `src/db/migrations/047_vn_questions.ts` — table + indexes

## Related Tickets

- `TASK-vn-dynamic-generation.md` — dynamic image/story generation (complementary)
- `TASK-vn-branching-choices.md` — branching choices (Q&A extends this)
- `TASK-visual-novel-mode.md` — base VN rendering (dependency, ✅ complete)
