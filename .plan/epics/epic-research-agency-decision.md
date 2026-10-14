<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC-RESEARCH-AGENCY-DECISION: NPC Decision-Making Stack

**Status:** Done
**Status Note:** 2026-10-10 — shipped surfaces are scoped: cadence, plan endpoint, and `bdi:<step>` decision stamping (dispatch consumes decisionEvents → recordActorDecisionType) are fully in; the telemetry AC is half-open by scope — `utility:<kind>` stamping waits on the reaction wiring (scoreReaction has no production caller yet — deliberate, not faked). All other ACs are fully met (see Current State).
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

- [x] `PersonalityModifierResolver`-style utility scorer covering all 6 reaction modes (`chat | wait | do_other | flee | attack | ignore`). (Shipped as `scoreReaction` in `src/characters/services/personality-service/utility-scorer.ts`; `REACTION_KIND` in `utility-scorer-types.ts` is the closed 6-kind enum.)
- [x] BDI types from `epic-agency-story-points.md` (DailyPlan, PlannedActivity, ReactionDecision, PlanRevision, ChatBuffer) materialized as a Kysely table set with migration.
- [x] Reflection cycle: nightly job (configurable cron) recomputes `DailyPlan` per active actor; reflection checkpoints every N steps; budget-gated by `epic-actor-autonomy-story-drive.md` governor. (Cadence knob `bdiReflectionStepInterval` in the autonomy config layer (default 0 = once-per-night, unchanged); counter column `actor_daily_plans.reflection_step_count` (migration 051); the dispatch ages steps and re-checkpoints every N.)
- [x] Player-visible plan surface opt-in: actor's active plan summarisable on demand (defer UI; ship JSON API first). (`GET /api/v1/actors/:actorId/plan` in `src/routes/actor-plan.ts`; opt-in via `actors.plan_visible` default 0; 404 for not-opted-in / foreign / missing.)
- [ ] Telemetry: per-actor decision counts (utility winner, BDI step type) feed `interaction_log.action_type` and `agency_mode`. (PARTIAL: `interaction_logs.action_type` column (migration 051) + `recordActionType`/`recordActorDecisionType` in `quality-metrics.ts` ship, and the dispatch consumes `runNightlyReflectionCycle`'s per-actor `decisionEvents` to stamp `bdi:plan_created` / `bdi:priority_shift` in production. NOT shipped: `utility:<kind>` stamping — `scoreReaction` still has no production reaction-decision site, so there is nothing to hook without faking one; the stamp lands with the reaction wiring.)

## Work Items (Lazy Ladder)

1. **`TASK-agency-utility-scorer`** — wire the personality profile weights as the reaction utility scorer. P0. 2 days. **Done.**
2. **`TASK-agency-bdi-reflection-cycle`** — migration + nightly BDI reflection job. P1. 1 week. **Done.**

## Current State (2026-10-10, updated after AC completion)

Additional to the shipped list below:

- Cadence: `bdiReflectionStepInterval` knob in the autonomy config layer (`src/autonomy/config/types.ts`, resolver, TOML section `src/config/sections/autonomy.ts`); default 0 = once-per-night (behavior unchanged). Migration 051 added `actor_daily_plans.reflection_step_count`; the production flow is `ageReflectionSteps` + `dueActors` in `src/autonomy/dispatch/bdi-due.ts` (called from `bdi-dispatch.ts`): world plans age one step per beat tick, plans that reached the interval get a recompute + `applyReflectionCheckpoint` + counter reset (`shouldReflectAt` / `resetReflectionSteps` in `bdi-reflection.ts`).
- Decision telemetry (scoped): `recordActionType` + `recordActorDecisionType` in `quality-metrics.ts`; the dispatch consumes `runNightlyReflectionCycle`'s `decisionEvents` and stamps each actor's latest `interaction_logs` row with `bdi:plan_created` / `bdi:priority_shift` (no-op when the actor has no log). `utility:<kind>` stamping is deliberately absent until a production reaction-decision site exists.
- Plan endpoint: `src/routes/actor-plan.ts` — `GET /api/v1/actors/:actorId/plan`, opt-in via `actors.plan_visible` (migration 051, default 0); ownership via `owner_id`/`user_id`; one 404 covers missing/foreign/not-opted-in. Registered in `src/routes/v1/base-surface.ts`. Tests: `src/routes/actor-plan.test.ts`.
- Stage-2 fallback: `src/regex/stage2-llm.ts` — `createStage2Parser` wires `parseAction`'s `Stage2LLMFn` to the real pipeline with the model chosen via `resolveModelRole(auxiliary)` → `resolveProvider` → `callLlm`; `validateStage2Output` enforces the closed verb enum + inventory/scene member sets and rejects invalid output with `null`. Tests: `src/regex/stage2-llm.test.ts`.
- Parser/affordance telemetry: `src/services/affordance/telemetry.ts` records `action_parser` (stage, verb) and `affordance_allow`/`affordance_denial` (verb, reason) events on the existing `telemetry_events` sink. Tests: `src/services/affordance/telemetry.test.ts`.

## Previously Shipped (2026-10-10 audit)

Shipped, verified in-tree (same 185-test run as the affordance epic):

- Utility scorer: `src/characters/services/personality-service/utility-scorer.ts` — `scoreReaction(personality, candidates, ctx)` + `deriveWeights`, `scoreOne`; `REACTION_KIND`/`REACTION_KINDS` cover all 6 modes. Tests: `utility-scorer.test.ts` (profile x kind matrix, selection invariants).
- Migration: `src/db/migrations/011_actor_bdi_lite.ts` — creates `actor_daily_plans`, `actor_planned_activities`, `actor_chat_buffers` (unique pair index; cooldown/cap enforced in app code, not SQLite CHECK), `actor_plan_revisions`; Kysely interfaces in `src/db/schema-core.ts`.
- Nightly cycle: `src/services/agency/bdi-nightly.ts` — `runNightlyReflectionCycle(db, actorIds, { budgetApprove, planRecompute, today })` (per-actor budget peek; `skippedBudget` on deny); `recordChatTurn` enforces `cooldown_minutes` (default 15) + `max_consecutive_chats` (default 3) per partner pair. Plan shaping/parsing: `bdi-plan-shape.ts` (`DailyPlan`, 4 priority buckets, text bounds); LLM recompute: `bdi-plan-recompute.ts` (`createPlanRecompute`, deterministic fallback on provider failure). Reflection checkpoint: `bdi-reflection.ts` — `applyReflectionCheckpoint` emits `actor_plan_revisions` rows on priority shift only.
- Cron wiring: `src/cron/jobs.ts` registers `createBdiDispatch` on the autonomy tick; `src/autonomy/dispatch/bdi-dispatch.ts` — `BDI_DISPATCH_NAME = "bdi"`, governor-gated via `per_hour_beat_dispatch` (peek + tryConsume), jitter and off-cadence skip; exported from `src/autonomy/index.ts`.
- Telemetry (partial): `src/services/agency/quality-metrics.ts` stamps `interaction_logs.agency_mode` (migration 009 added the column).
- All previously-open gaps closed 2026-10-10: plan endpoint and every-N-steps reflection cadence shipped; bdi decision stamping shipped; utility stamping scoped out (see Current State above).

## Out of Scope

- GOAP tactical planners (research verdict: not recommended for loop-lore).
- AI director tension/arc scoring (`epic-assistant-gm-flows.md` host).
- Per-player-custom AI personalities (separate epic if requested).


git issue: d5b9924

**Resolved:** 2026-10-10 registry-driven close: git issue d5b9924 (registry tip: 1952054b7 Konstantin Fedotov Auto-closed: appended .md marker marks EPIC-RESEARCH-AGENCY-DECISION do)
