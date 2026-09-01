<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Two-Pass Message Delivery (Draft → Finalization)

**Status:** Not Started
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** generation, two-pass, draft, refinement, narration, mood, cascade, cost
**Related:** epic-narration-pipeline.md, epic-generation-flow-control.md (2× call budget), epic-assistant-gm-flows.md (quality gating), epic-narration-actor-separation.md (who writes what in each pass), epic-chat-context-optimization.md

## Summary

Deliver each beat in **two LLM passes**:

1. **Pass 1 — draft:** initial narration (assistant/GM) + characters/NPCs generate a
   private draft: capture mood, tension, chain-of-thought *possible* reactions to each
   other. Draft is **never shown as the final message**; it is structured intermediate
   state (per-actor reaction intents, mood register, scene beats).
2. **Pass 2 — finalization:** narration is rewritten as the authoritative scene pass —
   overall atmosphere/mood plus the required level of hints about how actors will react
   to each other — then each character/NPC actor generates its **final refined version
   with isolated actions** (each actor sees narration + its own intent, not peers' raw
   drafts — see isolation in epic-narration-actor-separation).

Goal: coherence the single-pass cascade can't reach — actors foreshadow each other, mood
is set before actions, and per-actor isolation prevents draft-echo contamination.

## Current State (reviewed 2026-09-01)

- Single-pass only: auto-gen cascade generates each actor once, sequentially; GM
  (`src/story/game-master/`) reacts to user turns in one shot.
- The *shape* of pass infrastructure exists but is reactive-only:
  `src/generation/step-pipeline.ts`, quality evaluators/scorers (`src/story/quality/`),
  `smart-regen.ts` re-roll after scoring failure. No proactive draft→refine pass, no
  persisted draft artifact.
- `src/aux-pipeline/` provides the sidecar-LLM substrate for a draft stage.
- Cost reality: 2 passes ≈ ≥2× inference per beat → hard dependency on
  `epic-generation-flow-control.md` holds/budgets before default-on.

## Design

- **Draft artifact** — typed intermediate (mood vector, per-actor reaction intents, beat
  list) persisted per attempt (`generation_draft` row or attempt-linked JSON), never
  rendered in chat; retained for debug/replay only.
- **Isolation contract (pass 2):** an actor's final generation receives
  narration-final + *its own* draft intent + public scene history — never another actor's
  draft. Cross-influence flows only through the narration hints (controlled dosage).
- **Hint dosage is a knob:** `none | subtle | explicit` — how strongly pass-2 narration
  telegraphs intended reactions; default `subtle`.
- **Failure degradation:** pass-1 timeout/error → fall back to today's single-pass path
  (delivery must never hard-fail on the draft stage).
- **Streaming:** UI streams pass-2 only; pass-1 shows as a "composing…" status (draft
  tokens are user-invisible cost).
- **Scoring:** existing quality scorers run on the *final* output; a new draft-utilization
  scorer checks pass-2 actually incorporated pass-1 intents (guards against paying 2× cost
  for an ignored draft).

## Work Items

- [ ] **Draft stage schema** — typed draft artifact + persistence + retention policy. → TASK-two-pass-draft-schema
- [ ] **Pass 1 implementation** — aux-pipeline draft generation (narration mood + per-actor intents). → TASK-two-pass-draft-stage
- [ ] **Pass 2 finalization** — narration rewrite with hint dosage; per-actor isolated refinement in cascade. → TASK-two-pass-finalize-stage
- [ ] **Isolation enforcement** — context assembly guarantee (no peer drafts leak). → TASK-two-pass-isolation
- [ ] **Budget policy** — per-chat two-pass opt-in, flow-control accounting, single-pass fallback. → TASK-two-pass-budget
- [ ] **Draft-utilization scorer** — verify refinement consumed the draft. → TASK-two-pass-scorer
- [ ] **UI status semantics** — composing indicator, pass-2-only streaming. → TASK-two-pass-ui

## Non-Goals

- Multi-sample best-of-N inference (separate cost/benefit question)
- Editable draft surfaced to users (draft stays internal; user-facing iteration = existing regenerate/variant flows)
- Chain-of-thought *display* — "possible reactions" are structured intents, not raw CoT exposure

## Acceptance Criteria

- [ ] With two-pass on, every delivered beat has both passes journaled; draft never renders in chat.
- [ ] Actor A's final message contains no verbatim content from actor B's draft (isolation test).
- [ ] Hint dosage `explicit` measurably raises reaction-anticipation coherence vs `none` (scorer comparison).
- [ ] Pass-1 failure degrades to single-pass with no user-visible error; 2× cost is accounted per chat and holdable via flow-control.
