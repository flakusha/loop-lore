<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Perspective & Voice Control (1st / 3rd / Narrator)

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** perspective, pov, voice, narration, gm, persona, prompt-assembly
**Related:** epic-chat-lifecycle-moderation.md (ChatMode axis 3 — response style), epic-assistant-gm-flows.md (GM roles), epic-narration-actor-separation.md (role contracts), epic-immersion-presentation.md

## Summary

Let the user choose — per chat and per persona — **in which grammatical voice they roleplay**
and **whether a narrator/GM/assistant voice is present**:

- **First person** — user writes as the character: *"I draw my sword."*
- **Third person** — user writes about the character: *"She draws her sword."*
- **Narrator / GM / assistant mode** — the user contributes scene-level narration or
  director input rather than an actor turn.

The setting must flow through prompt assembly (system prompt + few-shot framing so LLM
actors mirror the user's voice), generation quality gating, and the frontend composer.

## Current State (reviewed 2026-09-01)

- Detection only: `FIRST_PERSON` regex in `src/regex/narrative.ts` (action markers,
  first-person detection); third-person movement handled by AUX-LLM fallback in
  `src/chat/transition-classifier.ts`.
- No perspective **setting** anywhere — nothing persists a user's chosen voice.
- Counterproductive bias: `src/story/quality/scorers/character-voice.ts` adds +5 for
  first-person — penalizes third-person style instead of enforcing the *configured* one.
- GM role exists (`GameMasterConfig.type: llm|human|hybrid`, per-actor model routing;
  `src/story/game-master/`), and ChatMode reconciliation (epic-chat-lifecycle-moderation)
  already separates participant structure / orchestration / response style — perspective
  is a fourth, orthogonal axis: **voice of the user's own messages**.

## Scope

1. **Perspective field** — chat-level default + persona-level override
   (`first | third | narrator`); narrator mode routes the message as GM/assistant input
   (ties into the three-axis ChatMode work, not a parallel taxonomy).
2. **Prompt assembly** — inject voice contract into actor prompts; actors mirror the
   user's perspective for their replies (character prompts state expected POV).
3. **Consistency enforcement** — quality scorer switches from fixed first-person bias to
   *configured-perspective* conformance check; mismatch → style hint in regeneration.
4. **UI** — composer indicator/toggle; rendering unaffected (voice is content, not layout).

## Work Items

- [ ] **Perspective schema + API** — chat/persona fields, validation, migration. → TASK-perspective-voice-schema
- [ ] **Prompt-assembly integration** — voice contract into generation context. → TASK-perspective-prompt-assembly
- [ ] **Scorer rework** — character-voice scorer obeys configured perspective, drops hardcoded first-person bonus. → TASK-perspective-voice-scoring
- [ ] **Composer UI** — perspective toggle + narrator-mode input affordance. → TASK-perspective-voice-ui

## Non-Goals

- Narrator/actor message-kind separation (`epic-narration-actor-separation.md`)
- GM orchestration behavior (`epic-assistant-gm-flows.md`)
- Response *style* axes already owned by ChatMode reconciliation

## Acceptance Criteria

- [ ] User set to third person: actor replies stay third person over ≥10 turns (scorer-verified).
- [ ] Narrator-mode user message is processed as director input, never as an actor action (no gate/skip misfire from epic-immersion-consistency-gate / epic-actor-turn-skip).
- [ ] Perspective survives reload (persisted per chat + persona override).
