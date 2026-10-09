<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN Q&A Mode

**Summary:** Question↔answer interaction inside VN scenes — a question card the
player answers, with the answer driving emotion, relationship, and scene
changes. Shipped on `vn-mode-qa-loop` (routes, service, `vn_questions` table,
`question-cards.ts` mounted at `render-scene.ts:238`); the answer's mood /
relationship impacts are still returned to the caller and never applied.
**Context:** Two unrelated deliverables share this ticket. (1) A static content
validator for VN scenes — shipped, but with no production caller. (2) A Q&A
interaction loop — built end-to-end on `vn-mode-qa-loop`, but four of its ACs
still fail and `next_scene_id` is discarded. See `## Status Split`, `## Scope`,
and `## Acceptance Criteria`.
**Acceptance Criteria:** Split in `## Acceptance Criteria` — validator boxes
(verified in `src/frontend/vn/qa-mode.ts`) vs interaction-loop boxes (verified
against `vn-mode-qa-loop` at `e87bd19c0` / `5e5af1d81`, not against `dev`).


**Status:** In Progress
**Status Note:** (2026-08-23) marked Done while its own body said the Q&A Interaction Loop was NOT STARTED with 10 unchecked ACs. Reconciled 2026-10-09 (first pass): validator done (but callerless), interaction loop absent — Done → In Progress. Re-reconciled the same day after `vn-mode-qa-loop` was found: the interaction loop now exists end-to-end, but four ACs still fail (scene transition, mood shift, relationship write, item-gain notice) and mobile responsiveness is unaddressed. Stays In Progress. Note the closed git issue is left as-is; re-opening it is out of scope here.
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

### 🟡 Q&A Interaction Loop (built 2026-10-09, consequences unapplied)

Built on branch `vn-mode-qa-loop` (`e87bd19c0` / `5e5af1d81`). The first
reconciliation pass on 2026-10-09 wrongly recorded this as NOT STARTED — that
verdict was made against `dev`, before the branch was found.

- `POST /api/chats/:id/vn/generate-questions` — wired (`vn-generate/questions.ts`)
- `GET /api/chats/:id/vn-questions?sceneIndex=N` and
  `POST /api/chats/:id/vn-questions/:questionId/answer` — wired
  (`routes/chats/vn-questions.ts`, both `checkChatAccess`-guarded, over the
  `vn_questions` table from migration `047_vn_questions.ts`)
- `src/frontend/vn/question-cards.ts` + `question-cards-render.ts` — mounted at
  `render-scene.ts:238-239`
- `qa-mode.ts` still covers static validation only, not interaction

What the branch does **not** do: apply `mood_impact` or `relationship_impact`
to the character systems, notify on item gain, or follow `next_scene_id` to a
new scene (the click handler discards the returned `nextSceneId`; only a
location change actually moves the player). See `## Acceptance Criteria`.

An earlier plan to move the interaction-loop scope to a separate follow-up ticket was not carried out; both deliverables stay tracked by this ticket (QA Validator ✅ / Interaction Loop 🟡), which keeps static validation and the interactive feature from being conflated.

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

### Q&A Interaction Loop — built on `vn-mode-qa-loop`, consequences not applied

Landed at `e87bd19c0` / `5e5af1d81` on branch `vn-mode-qa-loop`; verified
against that branch, not against this one.

- [x] `POST /api/chats/:id/vn/generate-questions` route mounted —
      `src/routes/vn-generate/questions.ts:145`, mounted from
      `vn-generate/index.ts`; persists each generated question so the GET can
      list it
- [x] `GET /api/chats/:id/vn-questions?sceneIndex=N` —
      `src/routes/chats/vn-questions.ts:43`, `checkChatAccess`-guarded, reads
      the `vn_questions` table (migration `047_vn_questions.ts`)
- [x] `POST /api/chats/:id/vn-questions/:questionId/answer` —
      `src/routes/chats/vn-questions.ts:48`, access-guarded, flips the row to
      `answered` with an optimistic `status = "available"` guard
- [x] Question card displays in VN scene with speaker + question text —
      `src/frontend/vn/question-cards-render.ts`, mounted at
      `render-scene.ts:238-239`
- [x] Answer options show text + impact preview — each option renders a
      `.vn-question-option-impact` `+N`/`−N` label derived from
      `relationship_modifier` (inline, not a hover tooltip)
- [ ] Selecting answer triggers scene transition — `answerQuestion` returns
      `nextSceneId`, but `initQuestionCards` discards it: the click handler is
      `void answerQuestion(questionId, optionId)`. Location change *is* applied
      (`PUT /api/chats/:id/location` + `chat:location-changed` event), so a
      location-bearing option does move the scene; a bare `next_scene_id` does
      not.
- [ ] Mood shift applied and visible in character portrait — `mood_impact` is
      parsed and returned by `answerVnQuestion`; the service comment states
      "Impacts are returned, not persisted to the character systems", and no
      portrait code reads them.
- [ ] Relationship change applied and reflected in relationship system —
      same: returned, never written.
- [ ] Item gain notification shown — no toast/notification path exists in
      `question-cards.ts`.
- [x] Q&A sessions persist across chat turns — questions are rows in
      `vn_questions` keyed by `(chat_id, scene_index)`; a reload re-runs
      `loadQuestions()` and unanswered rows re-appear.
- [x] LLM question generation produces contextually appropriate questions —
      `generateVnQuestions` runs the `PromptAssembler` from the chat's first
      participant, same step-for-step path as `choices.ts`.
- [ ] Mobile responsive — `src/public/css/vn.css` has no width-based media
      query; `.vn-question-card` is a fixed two-row flex column with no
      narrow-viewport rules.
- [x] Keyboard navigable (tab through options, enter to select) — options are
      native `<button>` elements (`question-cards-render.ts`), so focus order
      and activation come from the platform.

## Files — actual names

The original list guessed wrong on both counts; neither `qa-mode.ts` nor
`src/routes/vn-questions.ts` is where the loop ended up.

- `src/frontend/vn/qa-mode.ts` — ✅ exists, but is the **static validator**, not
  a question-card component
- `src/frontend/vn/question-cards.ts` + `question-cards-render.ts` — the real
  Q&A component (mounted at `render-scene.ts:238-239`)
- `src/chat/service/vn-questions.ts` — list / answer service over `vn_questions`
- `src/routes/chats/vn-questions.ts` — list + answer routes
- `src/routes/vn-generate/questions.ts` — generation route, mounted from
  `src/routes/vn-generate/index.ts` alongside `storyRoutes`/`choicesRoutes`
- `src/frontend/alpine/qa-mode.ts` — never created; Q&A is vanilla DOM, not
  Alpine

## Related Tickets

- `TASK-vn-dynamic-generation.md` — dynamic image/story generation (complementary)
- `TASK-vn-branching-choices.md` — branching choices (Q&A extends this)
- `TASK-visual-novel-mode.md` — base VN rendering (dependency, ✅ complete)

**Resolved:** 2026-10-09 registry-driven close: git issue 0f9d87d (registry tip: 990dcaee8 Konstantin Fedotov Ticket status: done)
