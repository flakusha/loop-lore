<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Matrix: Story Coherence Pipeline

**Scope:** cross-epic integration surface for the five story-coherence epics
(perspective, immersion gate, turn-skip, two-pass delivery, narration/actor separation).
**Epics:** `epic-perspective-narration-voice.md`, `epic-immersion-consistency-gate.md`,
`epic-actor-turn-skip.md`, `epic-two-pass-delivery.md`, `epic-narration-actor-separation.md`
**Status:** Proposed (design-stage; all rows are doc-resolved pending implementation)
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
| SC1 | Perspective | Gate | ✅ doc-resolved | `narrator`-mode user input bypasses actor-state gate (director input, not an actor claim) |
| SC2 | Perspective | Separation | ✅ doc-resolved | narrator-mode messages stamp kind `narration`; first/third-person actor text stamps `actor_action` |
| SC3 | Gate | Skip | ✅ doc-resolved | beat-state interlock: skip never gated; `hard-block` refusal MUST offer skip; `soft-refuse` consumes the beat (one outcome per beat) |
| SC4 | Gate | Two-pass | ⚠️ open | Gate audits *user* input pre-pass-1; generated actor output can break consistency too — whether the verdict engines also run in pass-2 QA is undecided (→ RESOLVE before implementation) |
| SC5 | Skip | Two-pass | ✅ doc-resolved | Skip-triggered GM/ambient beats are single-pass (no draft stage — nothing to isolate) |
| SC6 | Two-pass | Separation | ✅ doc-resolved | Pass-2 role split uses message kinds: narration pass finalizes exposition + hints; actor passes emit isolated `actor_action`; drafts carry no kind |
| SC7 | Gate | Separation | ✅ doc-resolved | `soft-refuse` output is kind `narration` (obstacle beat); `hard-block` notice is kind `system` |
| SC8 | Skip | Separation | ✅ doc-resolved | `turn_skip` renders as kind `system` absence record, never `actor_action` |
| SC9 | Perspective | Two-pass | ⚠️ open | Draft-stage mood/intent extraction should be perspective-aware (3rd-person scene framing reads differently) — dosage TBD, non-blocking |
| SC10 | All | player-state-machine | ✅ doc-resolved | Gate rules consume the shared layered actor-state module once epic-player-state-machine Phase 3 lands; until then gate ships with adapters over existing `src/rpg/skills`, `src/story/items`, battle checks |

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
