<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC-RESEARCH-AGENCY-DECISION: NPC Decision-Making Stack

**Status:** In Progress
**Status Note:** utility scorer + BDI reflection cycle shipped (see Current State); open: player-visible plan JSON endpoint, decision telemetry counters. `TASK-agency-bdi-reflection-cycle` remains open — plan-visibility AC unmet.
**Priority:** High
**Effort:** Large
**Type:** Research epic (drives implementation tickets)
**Source:** `docs/research/interaction-systems-agency.md` section 2
**Related:** `epic-actor-autonomy-story-drive.md` (scheduler/governance host), `epic-agency-story-points.md` (BDI types drafted), `epic-character-internal-traits.md` (autonomy/coping/approach axes), `src/characters/services/personality-service/`

**Tags:** research, agency, decision, bdi, utility-ai, reflection

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

- [x] Utility scorer for the reaction step covering all 6 reaction modes (`chat | wait | do_other | flee | attack | ignore`). (Shipped as `scoreReaction` in `src/characters/services/personality-service/utility-scorer.ts`; the originally named `PersonalityModifierResolver` does not exist in `src/`.)
- [x] BDI types from `epic-agency-story-points.md` (DailyPlan, PlannedActivity, ReactionDecision, PlanRevision, ChatBuffer) materialized as a Kysely table set with migration.
- [ ] Reflection cycle: nightly job (configurable cron) recomputes `DailyPlan` per active actor; reflection checkpoints every N steps; budget-gated by `epic-actor-autonomy-story-drive.md` governor. (Nightly recompute + budget gating ship; reflection runs once per night in `applyReflectionCheckpoint` — the configurable every-N-steps cadence is not implemented.)
- [ ] Player-visible plan surface opt-in: actor's active plan summarisable on demand (defer UI; ship JSON API first). (`src/routes/planning.ts` serves author plan items, not `actor_daily_plans`; no endpoint reads an actor's current plan.)
- [ ] Telemetry: per-actor decision counts (utility winner, BDI step type) feed `interaction_log.action_type` and `agency_mode`. (Partial: `src/services/agency/quality-metrics.ts` stamps `interaction_logs.agency_mode`; per-actor decision counts and `action_type` feed are not shipped.)

## Work Items (Lazy Ladder)

1. **`TASK-agency-utility-scorer`** — wire the personality profile weights as the reaction utility scorer. P0. 2 days. **Done.**
2. **`TASK-agency-bdi-reflection-cycle`** — migration + nightly BDI reflection job. P1. 1 week. **In Progress.**

## Current State (2026-10-10)

Shipped, verified in-tree (same 185-test run as the affordance epic):

- Utility scorer: `src/characters/services/personality-service/utility-scorer.ts` — `scoreReaction(personality, candidates, ctx)` + `deriveWeights`, `scoreOne`; `REACTION_KIND`/`REACTION_KINDS` cover all 6 modes. Tests: `utility-scorer.test.ts` (profile x kind matrix, selection invariants).
- Migration: `src/db/migrations/011_actor_bdi_lite.ts` — creates `actor_daily_plans`, `actor_planned_activities`, `actor_chat_buffers` (unique pair index; cooldown/cap enforced in app code, not SQLite CHECK), `actor_plan_revisions`; Kysely interfaces in `src/db/schema-core.ts`.
- Nightly cycle: `src/services/agency/bdi-nightly.ts` — `runNightlyReflectionCycle(db, actorIds, { budgetApprove, planRecompute, today })` (per-actor budget peek; `skippedBudget` on deny); `recordChatTurn` enforces `cooldown_minutes` (default 15) + `max_consecutive_chats` (default 3) per partner pair. Plan shaping/parsing: `bdi-plan-shape.ts` (`DailyPlan`, 4 priority buckets, text bounds); LLM recompute: `bdi-plan-recompute.ts` (`createPlanRecompute`, deterministic fallback on provider failure). Reflection checkpoint: `bdi-reflection.ts` — `applyReflectionCheckpoint` emits `actor_plan_revisions` rows on priority shift only.
- Cron wiring: `src/cron/jobs.ts` registers `createBdiDispatch` on the autonomy tick; `src/autonomy/dispatch/bdi-dispatch.ts` — `BDI_DISPATCH_NAME = "bdi"`, governor-gated via `per_hour_beat_dispatch` (peek + tryConsume), jitter and off-cadence skip; exported from `src/autonomy/index.ts`.
- Telemetry (partial): `src/services/agency/quality-metrics.ts` stamps `interaction_logs.agency_mode` (migration 009 added the column).
- Not shipped: JSON endpoint reading an actor's current plan (`src/routes/planning.ts` serves author plan items, not `actor_daily_plans`); configurable every-N-steps reflection cadence; per-actor decision-count telemetry.

## Out of Scope

- GOAP tactical planners (research verdict: not recommended for loop-lore).
- AI director tension/arc scoring (`epic-assistant-gm-flows.md` host).
- Per-player-custom AI personalities (separate epic if requested).


git issue: d5b9924
