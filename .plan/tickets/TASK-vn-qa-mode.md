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

### ⬜ Q&A Interaction Loop (NOT STARTED)

Genuinely missing. The question-card → answer → consequence pipeline is not implemented:

- `POST /api/chats/:id/vn/questions` — not wired
- `POST /api/chats/:id/vn/questions/:qid/answer` — not wired
- `src/frontend/vn/qa-mode.ts` covers validation only, not interaction
- `src/routes/vn-generate/index.ts` only wires `storyRoutes` + `choicesRoutes`; no question/answer routes

An earlier plan to move the interaction-loop scope to a separate follow-up ticket was not carried out; both deliverables stay tracked by this ticket (QA Validator ✅ / Interaction Loop ⬜), which keeps static validation and the interactive feature from being conflated.

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

### Q&A Interaction Loop — not started

- [ ] `POST /api/chats/:id/vn/questions` route mounted — no `vn/questions`
      route exists anywhere in `src/`
- [ ] `GET /api/chats/:id/vn/questions` — same
- [ ] `POST /api/chats/:id/vn/questions/:qid/answer` — same
- [ ] Question card displays in VN scene with speaker + question text
- [ ] Answer options show text + hover preview of impact
- [ ] Selecting answer triggers scene transition
- [ ] Mood shift applied and visible in character portrait
- [ ] Relationship change applied and reflected in relationship system
- [ ] Item gain notification shown
- [ ] Q&A sessions persist across chat turns
- [ ] LLM question generation produces contextually appropriate questions
- [ ] Mobile responsive
- [ ] Keyboard navigable (tab through options, enter to select)

## Files to Create

- `src/frontend/vn/qa-mode.ts` — ✅ exists, but is the **validator**, not the
  question-card component this list assumed
- `src/frontend/alpine/qa-mode.ts` — Alpine.js Q&A logic — does not exist
- `src/routes/vn-questions.ts` — API routes — does not exist; the natural home
  is `src/routes/vn-generate/questions.ts`, mounted from
  `src/routes/vn-generate/index.ts` alongside `storyRoutes`/`choicesRoutes`

## Related Tickets

- `TASK-vn-dynamic-generation.md` — dynamic image/story generation (complementary)
- `TASK-vn-branching-choices.md` — branching choices (Q&A extends this)
- `TASK-visual-novel-mode.md` — base VN rendering (dependency, ✅ complete)
