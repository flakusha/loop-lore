# TASK: VN Q&A Mode

**Status:** 🟡 Partial Complete — QA Validator ✅, Q&A Interaction Loop ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Medium
**Type:** Feature Task
**Tags:** visual-novel, qa-mode, interactive-storytelling
**Epic:** epic-visual-novel-mode.md

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

Invoked by the chat panel / GM tooling, not as part of the Q&A interaction loop.

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

- `src/frontend/vn/qa-mode.ts` — question card component
- `src/frontend/alpine/qa-mode.ts` — Alpine.js Q&A logic
- `src/routes/vn-questions.ts` — API routes (or extend `src/routes/vn.ts`)

## Related Tickets

- `TASK-vn-dynamic-generation.md` — dynamic image/story generation (complementary)
- `TASK-vn-branching-choices.md` — branching choices (Q&A extends this)
- `TASK-visual-novel-mode.md` — base VN rendering (dependency, ✅ complete)
