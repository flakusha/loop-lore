<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Two-Pass Message Delivery (Draft → Finalization)

**Overview:** (see sections below)


**Status:** Not Started
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** generation, two-pass, draft, refinement, narration, mood, cascade, cost
**Related:** epic-narration-pipeline.md, epic-generation-flow-control.md (2× call budget), epic-assistant-gm-flows.md (quality gating), epic-narration-actor-separation.md (who writes what in each pass), epic-chat-context-optimization.md
**Matrix:** `matrix-story-coherence.md` (SC4–SC6, SC9)

## Goals

- Get mood set before actions, so actors foreshadow each other instead of reacting blind.
- Stop draft-echo contamination: an actor's final message must not carry another actor's raw draft.
- Keep delivery alive when the draft stage fails — a 2× cost pass must never hard-fail a turn.

## Scope

- A typed, persisted draft artifact (`GenerationDraft`) and the pass-1 stage that produces it.
- Pass-2 finalization: narration rewrite with hint dosage, then per-actor isolated refinement inside the cascade.
- The isolation contract, the pass-1 failure fallback to single-pass, and the "composing…" UI status while pass 2 runs.
- A draft-utilization scorer so a paid-for draft cannot be silently ignored.

## Out of Scope

- Multi-sample best-of-N inference (a separate cost/benefit question).
- Surfacing an editable draft to users; user-facing iteration stays on the existing regenerate/variant flows.
- Raw chain-of-thought display — "possible reactions" are structured intents.
- The frontend draft/enhance primitives that already exist (§Current State); they are a separate surface, not the two-pass pipeline.

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

## Current State

- Single-pass only: auto-gen cascade generates each actor once, sequentially; GM
  (`src/story/game-master/`) reacts to user turns in one shot.
- The *shape* of pass infrastructure exists but is reactive-only:
  `src/generation/step-pipeline.ts`, quality evaluators/scorers (`src/story/quality/`),
  `smart-regen.ts` re-roll after scoring failure. No proactive draft→refine pass, no
  persisted draft artifact.
- `src/aux-pipeline/` provides the sidecar-LLM substrate for a draft stage.
- Composer-side draft primitives have landed independently of this epic and are **not**
  the two-pass pipeline: `src/frontend/alpine/draft-store.ts` (MRU/LRU persistence),
  `src/frontend/alpine/text-enhance.ts` (standalone LLM rewrite), `chat-drafts.ts`
  (localStorage drafts) and `composer-pre-send/` (+ its `composer-pre-send.ts` facade —
  `constants`, `draft-codec`, `preview`, `send-gate`, `validate`). None of them orchestrate
  draft → enhance → confirm → send; no such pipeline exists in `src/`.
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

- [ ] **Draft stage schema** — typed draft artifact + persistence + retention policy.
- [ ] **Pass 1 implementation** — aux-pipeline draft generation (narration mood + per-actor intents).
- [ ] **Pass 2 finalization** — narration rewrite with hint dosage; per-actor isolated refinement in cascade.
- [ ] **Isolation enforcement** — context assembly guarantee (no peer drafts leak).
- [ ] **Budget policy** — per-chat two-pass opt-in, flow-control accounting, single-pass fallback.
- [ ] **Draft-utilization scorer** — verify refinement consumed the draft.
- [ ] **UI status semantics** — composing indicator, pass-2-only streaming.

## Linked Tasks

Bound to this epic via the `**Epic:** epic-two-pass-delivery` header on each ticket.

- `TASK-matrix-story-coherence-gate-pass2-qa-decide-whether-gate-ver.md` — decide whether gate verdict engines run in pass-2 QA (SC4, still open)
- `TASK-matrix-story-coherence-perspective-aware-draft-set-perspecti.md` — perspective-aware mood/intent dosage for drafts (SC9, still open)

### Cross-epic references

Owned by another epic — listed here for traceability, **not** bound here:

- `TASK-sc10-player-state-machine-adapters.md` — `epic-player-state-machine.md`; SC10.
- `TASK-sc2-narrator-mode-kind-stamp.md` — `epic-narration-actor-separation.md`; SC2, the message-kind axis pass 2 depends on.

## Acceptance Criteria

- [ ] With two-pass on, every delivered beat has both passes journaled; draft never renders in chat.
- [ ] No draft artifact is reachable from the chat render path.
- [ ] Actor A's final message contains no verbatim content from actor B's draft (isolation test).
- [ ] Hint dosage `explicit` measurably raises reaction-anticipation coherence vs `none` (scorer comparison).
- [ ] Pass-1 failure degrades to single-pass with no user-visible error; 2× cost is accounted per chat and holdable via flow-control.

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| src/aux-pipeline + epic-generation-flow-control.md | sidecar substrate, budgets | pass-1 draft cost-governed (≥2×/beat) |
| epic-narration-actor-separation.md | role contracts | pass-2 narration/actor split (SC6) |
| epic-immersion-consistency-gate.md | `GateVerdict` | user input audited pre-pass-1 (SC4 open for generated output) |
| src/story/quality scorers | scoring substrate | runs on final; new draft-utilization scorer |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| epic-narration-pipeline.md | finalized narration + hints | downstream sounding/enrichment |
| Frontend streaming | pass-2 tokens only | draft invisible; "composing…" status |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `GenerationDraft { mood, beats, intents: ActorIntent[] }` | pass-1 → pass-2 | isolated per-actor handoff |
| `HintDosage = none \| subtle \| explicit` | separation, config | reaction-telegraph strength |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `beat.draft.ready` | emits | finalization trigger |
| `turn.skipped` | subscribes | skip beats bypass draft stage (SC5) |

