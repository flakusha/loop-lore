<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Immersion Consistency Gate (Actor-State Blockage & Refusal)

**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started — design and acceptance criteria are complete, but none of the six Work Items has code. The ground-truth state this gate reads is itself partially built (`src/rpg/skills`, `src/rpg/stats`, `src/story/items/`, `src/battle/resolution-integration/checks.ts`); the shared state module from `epic-player-state-machine.md` is not implemented, so the rule engine has no single source to check against. No ticket owns any Work Item.
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** immersion, actor-state, moderation, consistency, refusal, pre-generation, rules
**Related:** epic-player-state-machine.md (state layers = ground truth), epic-actor-turn-skip.md (escape hatch), epic-chat-lifecycle-moderation.md (loop/hallucination protection), epic-narration-pipeline.md, epic-battle-integration-gaps.md (skill-check outcomes)
**Matrix:** `matrix-story-coherence.md` (SC1, SC3–SC4, SC7, SC10)

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

| # | Work Item | Status | Ticket |
| - | --------- | ------ | ------ |
| 1 | Claim extraction - detect action/skill/item/movement claims (regex + aux) | Not Started | none |
| 2 | Deterministic rule engine - actor state, skills, inventory, pending failed-check consequences | Not Started | none |
| 3 | Failed-check enforcement - consume battle/dice outcomes to constrain follow-up actions | Not Started | none |
| 4 | LLM classifier (opt-in) - prose-level audit via aux-pipeline, budget-governed | Not Started | none |
| 5 | Refusal narration path - soft-refusal to attempted-action framing into GM/narration | Not Started | none |
| 6 | Config surface + audit - per-chat severity, per-rule toggles, decision log | Not Started | none |

> **Every Work Item is unticketed.** This epic is a design with no implementation
> vehicle; filing a ticket for it is the prerequisite for any of the above to start.

## Dependencies

- `epic-player-state-machine.md` - the layered state model is the ground truth this
  gate checks against; not yet implemented
- `src/regex/` - claim extraction reuses the existing extraction pipeline
- `src/rpg/skills`, `src/rpg/stats`, `src/rpg/dice` - check sources
- `src/story/items/` - inventory membership checks
- `src/battle/resolution-integration/checks.ts` - battle resolution outcomes
- `epic-actor-turn-skip.md` - the escape hatch offered on `hard-block`
- `epic-generation-flow-control.md` - budget governance for the classifier

## Related Epics

- `epic-player-state-machine.md` - state layers = ground truth
- `epic-actor-turn-skip.md` - escape hatch on hard-block
- `epic-chat-lifecycle-moderation.md` - loop/hallucination protection
- `epic-narration-pipeline.md` - refusal narration target
- `epic-battle-integration-gaps.md` - skill-check outcomes
- `epic-gm-shadow-notes.md` - GM notes integrate with note types
- `epic-immersion-presentation.md` - narration presentation of refusals
- `epic-generation-flow-control.md` - classifier budget
- `epic-narration-actor-separation.md` - `MessageKind` for the OOC notice
- `epic-social-interaction.md` - NPC reaction to blocked actions
- `epic-assistant-gm-flows.md` - GM-side narration of refused actions
- `epic-research-agency-decision.md` - NPC reaction state after a soft-refusal

## Unticketed Gaps

- No ticket file exists for this epic at all; all six Work Items are unowned.
- The severity ladder has no config surface (`allow`/`annotate`/`soft-refuse`/`hard-block`
  are design-only).
- The decision log required by the audit acceptance criterion has no storage table.

## Non-Goals

- NSFW/content-policy moderation (separate layer, `src/nsfw/`)
- Authoritative state model implementation (owned by `epic-player-state-machine.md` - this epic consumes it)
- Retroactive correction of already-accepted messages (message editing/branching territory)

## Acceptance Criteria

- [ ] Captive-flagged actor message "I sprint away" triggers at least `annotate`; with severity `soft-refuse` the generated turn narrates the failed escape, not the success.
- [ ] Skill/item claims absent from actor state are flagged with the specific missing precondition (explainable verdict, no silent block).
- [ ] Deterministic engine adds < 50 ms p95 to message path (classifier off); classifier runs within flow-control budget and never blocks the default path.
- [ ] Every gate decision auditable: input, state snapshot, verdict, severity, engine attribution.

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| epic-player-state-machine.md | layered actor state | rule engine ground truth (SC10 adapters until Phase 3) |
| src/rpg/skills, src/story/items, battle checks | ownership / failed-check facts | deterministic preconditions |
| src/regex + epic-aux-enrichment-pipeline | claim extraction, sidecar LLM | inputs to rule + classifier engines |
| epic-generation-flow-control.md | budgets, holds | classifier calls governed |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| epic-actor-turn-skip.md | `GateVerdict` | interlock: hard-block offers skip; soft-refuse consumes beat (SC3) |
| epic-two-pass-delivery.md | pre-pass-1 audit | gates user input before draft (SC4 open for generated output) |
| epic-narration-pipeline.md | refusal intent | soft-refuse narration beats |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `GateVerdict { severity, ruleId, claims, stateSnapshot }` | skip, two-pass, telemetry | explainable decision |
| `MessageKind` (emits `narration`/`system` outputs) | separation | SC7 |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `gate.verdict` | emits | interlock, UI escape hatch, audit |

