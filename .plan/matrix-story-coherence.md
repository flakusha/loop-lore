<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Matrix: Story Coherence Pipeline

**Scope:** cross-epic integration surface for the five story-coherence epics
(perspective, immersion gate, turn-skip, two-pass delivery, narration/actor separation).
**Epics:** `epic-perspective-narration-voice.md`, `epic-immersion-consistency-gate.md`,
`epic-actor-turn-skip.md`, `epic-two-pass-delivery.md`, `epic-narration-actor-separation.md`
**Status:** Proposed (design-stage; SC3/SC5/SC6/SC8 implemented; SC1/SC2/SC7/SC10 ticketed; SC4/SC9 open)
**Tags:** integration, matrix, narration, actors, moderation, generation

## Feature Evaluation

| Capability | Owner epic | Consumed by | Notes |
| ---------- | ---------- | ----------- | ----- |
| Perspective (`first\|third\|narrator`) | perspective-narration-voice | gate, skip, separation, prompt assembly | voice axis orthogonal to ChatMode axes |
| Gate verdict (`allow\|annotate\|soft-refuse\|hard-block`) | immersion-consistency-gate | skip interlock, narration (refusal beats), two-pass entry | fiction-consistency only; NSFW layer separate |
| Turn-skip (`hold\|advance`) | actor-turn-skip | GM beat generation, cascade, gate interlock | distinct from legacy Continue (partial resume) |
| Generation draft (mood + per-actor intents) | two-pass-delivery | pass-2 finalization, narration hints | private artifact, never rendered |
| Message kind (`narration\|actor_action\|system`) | narration-actor-separation | all four + rendering, context assembly, extraction | replaces author-inference |

## Pairwise Integration Gaps

| # | System A | System B | Status | Required integration |
| - | -------- | -------- | ------ | -------------------- |
| SC1 | Perspective | Gate | ✅ `TASK-sc1-perspective-gate-bypass.md` | `narrator`-mode user input bypasses actor-state gate (director input, not an actor claim) |
| SC2 | Perspective | Separation | ✅ `TASK-sc2-narrator-mode-kind-stamp.md` | narrator-mode messages stamp kind `narration`; first/third-person actor text stamps `actor_action` |
| SC3 | Gate | Skip | ✅ IMPLEMENTED | beat-state interlock: skip never gated; `hard-block` refusal MUST offer skip; `soft-refuse` consumes the beat (one outcome per beat) — `TASK-turn-skip-gate-interlock.md` (Done, landed 2026-09-25); `src/chat/service/crud/turn-skip.ts:72`, `src/components/chat/input-area.html:78`, `src/assistant/prompt/sections/turn-skip-absence.ts` |
| SC4 | Gate | Two-pass | ⚠️ open | Gate audits *user* input pre-pass-1; generated actor output can break consistency too — whether the verdict engines also run in pass-2 QA is undecided (→ RESOLVE before implementation) |
| SC5 | Skip | Two-pass | ✅ IMPLEMENTED | Skip-triggered GM/ambient beats are single-pass (no draft stage — nothing to isolate) — design contract in `epic-actor-turn-skip.md:62` (skip beats bypass draft) + `epic-two-pass-delivery.md:117` (`turn.skipped` event subscribed); both epics Not Started; no code required until epics ship |
| SC6 | Two-pass | Separation | ✅ IMPLEMENTED | Pass-2 role split uses message kinds: narration pass finalizes exposition + hints; actor passes emit isolated `actor_action`; drafts carry no kind — design contract in `epic-two-pass-delivery.md:94` + `epic-narration-actor-separation.md:119`; both epics Not Started; no code required until epics ship |
| SC7 | Gate | Separation | ✅ `TASK-sc7-gate-separation-kind-semantics.md` | `soft-refuse` output is kind `narration` (obstacle beat); `hard-block` notice is kind `system` |
| SC8 | Skip | Separation | ✅ IMPLEMENTED | `turn_skip` renders as kind `system` absence record, never `actor_action` — `src/chat/service/crud/turn-skip.ts:7` (role=system, content_type=turn_skip); `epic-actor-turn-skip.md:92`; `epic-narration-actor-separation.md:135` |
| SC9 | Perspective | Two-pass | ⚠️ open | Draft-stage mood/intent extraction should be perspective-aware (3rd-person scene framing reads differently) — dosage TBD, non-blocking |
| SC10 | All | player-state-machine | ✅ `TASK-sc10-player-state-machine-adapters.md` | Gate rules consume the shared layered actor-state module once epic-player-state-machine Phase 3 lands; until then gate ships with adapters over existing `src/rpg/skills`, `src/story/items`, battle checks |

## Shared Data Contracts (design-stage)

| Contract | Shared by | Purpose |
| -------- | --------- | ------- |
| `MessageKind = narration \| actor_action \| system` | all 5 | role-first-class dispatch, rendering, extraction |
| `Perspective = first \| third \| narrator` | perspective, gate, separation | voice routing + gate bypass rule (SC1) |
| `GateVerdict { severity, ruleId, claims, stateSnapshot }` | gate, skip, two-pass | explainable decision + interlock state |
| `TurnSkip { actor, beat, mode: hold \| advance }` | skip, gate, separation | absence record with beat consumption semantics |
| `GenerationDraft { mood, beats, intents: ActorIntent[] }` | two-pass | pass-1 → pass-2 handoff (isolated per actor) |
| `HintDosage = none \| subtle \| explicit` | two-pass, separation | narration telegraph strength |

## Cross-System Events (design-stage)

| Event | Emits | Subscribes | Purpose |
| ----- | ----- | ---------- | ------- |
| `gate.verdict` | gate | skip UI, two-pass entry, telemetry | interlock + budget decisions |
| `turn.skipped` | skip | GM beat gen, cascade, autonomy scheduler | slot release / ambient beat |
| `beat.draft.ready` | two-pass pass-1 | pass-2 finalizer | draft handoff |
| `scene.info.starved` | separation coverage scorer | GM spotlight, UI hint | narrator-absent fallback escalation |

## Sequencing

1. **Separation (message kind)** first — every other epic stamps/routes on the kind;
   cheapest schema change with the widest unblocking effect.
2. **Perspective** — small surface, unblocks voice-consistent prompts for pass work.
3. **Gate** → **Skip** — interlock needs both; land behind `allow`/`annotate` defaults.
4. **Two-pass** last — highest cost, depends on kinds (SC6) and flow-control budget.

## Related

- `.plan/README.md` → Integration Matrices (naming rule `matrix-<scope>.md`)
- `matrix-cross-mechanics.md` — standardized `## Integration Points` template
