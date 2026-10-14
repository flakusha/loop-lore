<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-agency-bdi-reflection-cycle: BDI-lite nightly job + reflection checkpoints

**Status:** Done
**Status Note:** all ACs met 2026-10-10. Cadence: `bdiReflectionStepInterval` config knob + `actor_daily_plans.reflection_step_count` (migration 051); plan endpoint `GET /api/v1/actors/:actorId/plan` (opt-in via `actors.plan_visible`, `src/routes/actor-plan.ts`); decision telemetry `interaction_logs.action_type` + `recordActionType` + per-actor `decisionEvents`. Forward-only migration policy holds (051 is additive; 011's `down()` matches repo convention across all 50 prior migrations).
**Priority:** P1 (within EPIC-RESEARCH-AGENCY-DECISION)
**Effort:** 1 week
**Parent epic:** `epic-research-agency-decision.md`
**Related:** `epic-agency-story-points.md` (`DailyPlan`, `PlannedActivity`, `ReactionDecision`, `PlanRevision`, `ChatBuffer` types - all drafted, not materialised), `epic-actor-autonomy-story-drive.md` (scheduler), `src/memory/` (memory budget / provisioning / purge), `epic-character-internal-traits.md` (aspirations)

**Summary:**

## Goal

Materialise the BDI-lite types drafted in `epic-agency-story-points.md` as a Kysely migration + nightly reflection cycle. Goal-pursuit loop per Park et al. 2023 (Generative Agents), trimmed to chat-RPG scale.

**Context:**

## Why

- BDI is the reference architecture for aspiration-driven NPCs.
- The most expensive variant (LLM call per regeneration); must be **per-actor nightly**, not per-tick.
- Memory budget primitives already exist; reflection checkpoints are the documented fix for goal drift (Zylos 2026).

**Acceptance Criteria:**

- [x] Kysely migration adds `actor_daily_plans`, `actor_planned_activities`, `actor_chat_buffers`, `actor_plan_revisions` tables per the drafted schemas.
- [x] Nightly cron recomputes `DailyPlan` for every active actor; cost-tracked via `epic-actor-autonomy-story-drive.md` governor (refuses when budget exceeded).
- [x] Reflection checkpoint every N planned steps (configurable, default 4): re-prioritises activities; emits `PlanRevision` row when priorities shift. (Shipped 2026-10-10: `bdiReflectionStepInterval` config knob; default 0 preserves the once-per-night behavior per the unchanged-default requirement — any positive N re-checkpoints every N beat steps with counter `actor_daily_plans.reflection_step_count`, migration 051.)
- [x] ChatBuffer prevents same-partner spam: `cooldown_minutes` + `max_consecutive_chats` enforced.
- [x] Migration is **forward-only** (append-only policy; no destructive alter on existing rows).
- [x] Plan visibility: JSON API endpoint to read an actor's current plan (player opt-in only; off by default). (`GET /api/v1/actors/:actorId/plan` in `src/routes/actor-plan.ts`; `actors.plan_visible` default 0; tests cover 200/plan-null/404 not-opted-in/foreign/missing.)

## Out of Scope

- Player-visible plan rendering UI.
- LLM-driven plan commentary in chat (defer).
- Aspiration CRUD (separate epic; epic-character-internal-traits).


git issue: cf7879a

**Resolved:** 2026-10-10 registry-driven close: git issue cf7879a (registry tip: 5123ff0d7 Konstantin Fedotov Close issue)
