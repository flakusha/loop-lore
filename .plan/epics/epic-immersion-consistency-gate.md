<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Immersion Consistency Gate (Actor-State Blockage & Refusal)

**Status:** Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** immersion, actor-state, moderation, consistency, refusal, pre-generation, rules
**Related:** epic-player-state-machine.md (state layers = ground truth), epic-actor-turn-skip.md (escape hatch), epic-chat-lifecycle-moderation.md (loop/hallucination protection), epic-narration-pipeline.md, epic-battle-integration-gaps.md (skill-check outcomes)

## Summary

Pre-generation analysis of the **actor (user) message** against authoritative world and
actor state; messages that break immersion get **blockage or in-fiction refusal** instead
of silently derailing the story:

- actor is captive / restrained but *moves and runs freely*
- actor uses **skills they don't have**
- actor interacts with **items not in their inventory**
- actor **fails a skill check** but continues the interaction as if they passed
- …and analogous state contradictions

The gate is about **fictional consistency**, not content policy — NSFW moderation
(`src/nsfw/moderation-service/`) and this gate are independent layers stacked on the same
message lifecycle.

## Current State (reviewed 2026-09-01)

- No fiction-consistency checking of user input exists. Moderation today: NSFW content
  policy + appeals, and planned loop/hallucination protection
  (`epic-chat-lifecycle-moderation.md`) — all different concerns.
- Ground-truth state **does** exist, scattered: `src/rpg/skills`, `src/rpg/stats`,
  `src/rpg/dice`, battle resolution checks (`src/battle/resolution-integration/checks.ts`),
  inventory services (`src/story/items/`), and the layered state model designed in
  `epic-player-state-machine.md` (not yet implemented as a shared module).
- Skill-check outcomes reach the narrative only through prompt context; nothing consumes
  a failed check to constrain the *next* user action.

## Design

**Severity ladder** (configurable per chat; default = warn):

|Level|Behavior|
|---|---|
|`allow`|pass through (log stats only)|
|`annotate`|pass through + inject contradiction hint into actor prompts ("you noticed X, though bound")|
|`soft-refuse`|message consumed as *attempted* action; GM/narration generates the in-fiction obstacle (straining against bonds, skill unavailable, item not found)|
|`hard-block`|rejected pre-generation; OOC system notice with reason; user may edit or **skip turn** (epic-actor-turn-skip)|

**Two engines, one verdict:**

1. **Deterministic rule checks** (fast, explainable): state flags (captive/restrained via
   player-state-machine layers), skill ownership vs. claimed skill use, inventory
   membership vs. referenced item, unresolved failed-check pending consequences.
   Extraction of claims from the message reuses the regex extraction pipeline
   (`src/regex/`) + aux-pipeline enrichment.
2. **LLM consistency classifier** (opt-in, aux-pipeline sidecar): catches prose-level
   breaks regex can't; consumes governed budget (`epic-generation-flow-control.md`).

**Precedence:** deterministic findings win on conflict; classifier can only *downgrade*
severity, never upgrade a deterministic pass to a block (no false-positive lockouts).

**Refusal is narrated, never moralized:** soft-refusal output explains the obstacle in
fiction, preserving story flow; reasons surfaced OOC only on hard-block.

## Work Items

- [ ] **Claim extraction** — detect action/skill/item/movement claims from user messages (regex + aux). → TASK-immersion-gate-claims
- [ ] **Deterministic rule engine** — checks against actor state, skills, inventory, pending failed-check consequences. → TASK-immersion-gate-rules
- [ ] **Failed-check enforcement** — consume battle/dice outcomes to constrain follow-up actions. → TASK-immersion-gate-check-failure
- [ ] **LLM classifier (opt-in)** — prose-level immersion audit via aux-pipeline, budget-governed. → TASK-immersion-gate-llm
- [ ] **Refusal narration path** — soft-refusal → attempted-action framing into GM/narration generation. → TASK-immersion-gate-refusal
- [ ] **Config surface + audit** — per-chat severity, per-rule toggles, decision log for review/rollback. → TASK-immersion-gate-config

## Non-Goals

- NSFW/content-policy moderation (separate layer, `src/nsfw/`)
- Authoritative state model implementation (owned by `epic-player-state-machine.md` — this epic consumes it)
- Retroactive correction of already-accepted messages (message editing/branching territory)

## Acceptance Criteria

- [ ] Captive-flagged actor message "I sprint away" triggers at least `annotate`; with severity `soft-refuse` the generated turn narrates the failed escape, not the success.
- [ ] Skill/item claims absent from actor state are flagged with the specific missing precondition (explainable verdict, no silent block).
- [ ] Deterministic engine adds < 50 ms p95 to message path (classifier off); classifier runs within flow-control budget and never blocks the default path.
- [ ] Every gate decision auditable: input, state snapshot, verdict, severity, engine attribution.
