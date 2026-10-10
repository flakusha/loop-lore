<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-agency-bdi-reflection-cycle: BDI-lite nightly job + reflection checkpoints

**Status:** In Progress
**Status Note:** audit 2026-10-10: migration 011, nightly cycle + cron dispatch, budget gating, ChatBuffer cooldown/cap, priority-shift `PlanRevision` all ship with tests (185 green in the agency/affordance run). Open: player-visible JSON endpoint for an actor's current plan; configurable every-N-steps reflection cadence (`applyReflectionCheckpoint` runs once per night).
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
- [ ] Reflection checkpoint every N planned steps (configurable, default 4): re-prioritises activities; emits `PlanRevision` row when priorities shift. (Shift detection + `PlanRevision` emission ship via `applyReflectionCheckpoint`, but it runs once per nightly cycle — no configurable N-steps cadence.)
- [x] ChatBuffer prevents same-partner spam: `cooldown_minutes` + `max_consecutive_chats` enforced.
- [x] Migration is **forward-only** (append-only policy; no destructive alter on existing rows).
- [ ] Plan visibility: JSON API endpoint to read an actor's current plan (player opt-in only; off by default). (No endpoint reads `actor_daily_plans`; `src/routes/planning.ts` is the unrelated author plan-items API.)

## Out of Scope

- Player-visible plan rendering UI.
- LLM-driven plan commentary in chat (defer).
- Aspiration CRUD (separate epic; epic-character-internal-traits).


git issue: cf7879a
