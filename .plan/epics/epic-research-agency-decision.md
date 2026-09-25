<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC-RESEARCH-AGENCY-DECISION: NPC Decision-Making Stack

**Status:** Draft
**Priority:** High
**Effort:** Large
**Type:** Research epic (drives implementation tickets)
**Source:** `docs/research/interaction-systems-agency.md` section 2
**Related:** `epic-actor-autonomy-story-drive.md` (scheduler/governance host), `epic-agency-story-points.md` (BDI types drafted), `epic-character-internal-traits.md` (autonomy/coping/approach axes), `src/characters/services/personality-service/`

**Tags:** research, agency, affordance, parser, action

**Overview:**

## Summary

Specify and prototype the NPC **decision-making stack** that `epic-actor-autonomy-story-drive.md` invokes but does not define. Per decision surface:

| Surface                  | Model     | Why                                                   |
| ------------------------ | --------- | ----------------------------------------------------- |
| Movement tick            | Behavior Tree (existing) | Deterministic; `src/rpg/npc-navigation/` ships this  |
| Per-turn reaction        | Utility AI               | Cheap; scales; personality traits are the weights     |
| Aspiration pursuit       | BDI-lite                 | Reference: Stanford Generative Agents (2023)          |
| Multi-step planning      | BDI + reflection         | Per-actor nightly job; budget-gated                   |

GOAP is **explicitly out of scope** (over-engineered for chat-RPG; see research section 2.1).

## Architecture

```
  autonomy scheduler (epic-actor-autonomy-story-drive.md)
        |
        |-- due: movement tick     --> behavior tree (existing)
        |-- due: reaction          --> utility scorer (NEW: TASK-agency-utility-scorer)
        |-- due: aspiration plan   --> BDI-lite reflection cycle (NEW: TASK-agency-bdi-reflection-cycle)
        |
        v
  governor (budget / jitter / kill switch - existing)
```

## Acceptance Criteria

- [ ] `PersonalityModifierResolver` (existing) extended as utility scorer for the reaction step; unit tests cover scoring for all 6 reaction modes (`chat | wait | do_other | flee | attack | ignore`).
- [ ] BDI types from `epic-agency-story-points.md` (DailyPlan, PlannedActivity, ReactionDecision, PlanRevision, ChatBuffer) materialized as a Kysely table set with migration.
- [ ] Reflection cycle: nightly job (configurable cron) recomputes `DailyPlan` per active actor; reflection checkpoints every N steps; budget-gated by `epic-actor-autonomy-story-drive.md` governor.
- [ ] Player-visible plan surface opt-in: actor's active plan summarisable on demand (defer UI; ship JSON API first).
- [ ] Telemetry: per-actor decision counts (utility winner, BDI step type) feed `interaction_log.action_type` and `agency_mode`.

## Work Items (Lazy Ladder)

1. **`TASK-agency-utility-scorer`** — wire `PersonalityModifierResolver` as the reaction utility scorer. P0. 2 days.
2. **`TASK-agency-bdi-reflection-cycle`** — migration + nightly BDI reflection job. P1. 1 week.

## Out of Scope

- GOAP tactical planners (research verdict: not recommended for loop-lore).
- AI director tension/arc scoring (`epic-assistant-gm-flows.md` host).
- Per-player-custom AI personalities (separate epic if requested).


git issue: d5b9924
