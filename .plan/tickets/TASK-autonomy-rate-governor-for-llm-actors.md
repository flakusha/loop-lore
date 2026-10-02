<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Autonomy rate governor for LLM actors

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Wontfix
**Priority:** high
**Effort:** Medium
**Epic:** epic-actor-autonomy-story-drive

## Summary

Highest-priority governance layer for autonomous character/NPC/GM actions: no autonomous LLM call may ship ungoverned. Epic: epic-actor-autonomy-story-drive.

## Current state

- Group-chat cascade max-turns/consecutive-turn guards are the only existing auto-drive capping (chat-scoped only).
- Auth rate limiters are HTTP-transport-level; nothing budgets LLM actions.
- NpcNavigationService tick processing has no caller and no budget.

## Direction

1. Governor service consulted before every autonomous action dispatch; denial is default; autonomy is opt-in per world/chat.
2. Budgets: per-actor actions/hour, per-world/chat actions/hour, token + cost caps per window. In-flight bound rides the route-level concurrency semaphore (FEAT-generation-rate-limiting-and-concurrency-limits); the governor adds actor-level quotas above it, not a second semaphore.
3. Cooldowns with mandatory jitter (configurable spread ratio) — fixed intervals read robotic; jitter is part of pseudoorganic pacing, not optional polish.
4. Kill switch: per-world scope is autonomy-native; global + per-chat holds are CONSUMED from generation flow control (FEAT-global-generation-pause-kill-switch system_config key + story_state.isPaused) — no parallel pause machinery. Takes effect between actions, aborts queued dispatches.
5. Cost accounting: every autonomous generation logged per actor (tokens, model, est. cost) — surfaces in health/telemetry.
6. Unlimited mode ONLY behind explicit dev/stress flag (config-gated, refused in production builds); when on, every action still cost-logged.

## Acceptance

- [x] Ungoverned dispatch path is impossible: generation pipeline rejects autonomous actions lacking governor grant (tested).
- [x] Budget exhaustion denies gracefully (actor idles, no error spam); partial-window refill verified.
- [x] Jitter spread verified statistically in tests; zero-jitter only via explicit config.
- [ ] Kill switch stops mid-loop within one action; unlimited mode refused without dev flag.
- [ ] Cost ledger queryable per actor/world/window.

## Duplicate of

`TASK-autonomy-rate-governor.md` (Status: **Done**, git issue `44dc2a8`) — the same
governance layer, filed twice in this epic. The shipped `AutonomyGovernor`
(`src/autonomy/governor/index.ts:142`, `tryConsume`) already denies by default and
is consulted before every dispatch; `src/autonomy/governor/index.test.ts` proves
the four behaviours this ticket's boxes name, in
`describe("AutonomyGovernor.tryConsume")`:

- "actor-scoped: accept up to cap, deny over" and "user-scoped: separate counter
  from actor scope" — per-actor and per-user budget exhaustion denies and the
  actor idles, because a denied consume deliberately leaves the persisted row
  unmutated (no error spam, no wedged gate).
- "window expiry resets counter" — the partial-window refill, and
  "persistence across DB restarts" — the `autonomy_budget` row survives a new
  connection, so a restart cannot buy a fresh budget.
- "cap = null (unbounded) returns ok without touching DB" and
  "bypass-resistance: every consume routes through the gate" — the
  deny-by-default, no-bypass-path claim. Every autonomous entry point charges
  the same gate: the scheduler resolves the config then consumes before dispatch
  (`src/autonomy/scheduler/index.ts`), and the NPC movement tick driver consumes
  before `processMovementTick` (`src/rpg/npc-navigation/tick-driver.ts`).
- `describeReal("telemetry: governor.budget.exceeded on trip")` — one event per
  denial carrying the scope/limit/window payload.

Jitter is not a governor concern and is not duplicated here: it is a cadence
knob on the layered config, applied as a per-tick Bernoulli drop in the tick
driver (`cfg.jitterRatio`, `src/rpg/npc-navigation/tick-driver.ts:129`) and covered
by `tick-driver.test.ts` ("jitter: rng below jitterRatio returns skipped: 'jitter'"
and its firing counterpart). That knob is owned by
`TASK-autonomy-config-surface.md` (Done) and is exercised by this epic's
`TASK-autonomy-deterministic-turns` (open), not by this file.

Wontfix recorded 2026-10-02; `**Epic:**` corrected from the non-existent id
`epic-actor-autonomy-story-drive.md` to `epic-actor-autonomy-story-drive`. This is a
close-as-duplicate, not a claim that the subsystem is finished: the two unticked
boxes are genuinely unmet and are left visible rather than checked off.

- **Kill switch, global half.** The unlimited-mode half is met
  (`UnboundedStressGatedError` in `src/autonomy/config/resolver.test.ts`,
  `describe("dev-only gating")`) and per-world hold is met
  (`AutonomyScheduler.pause` / `resume`, persisted in
  `world_simulation_state.paused`; covered in `src/autonomy/scheduler/index.test.ts`,
  `describe("AutonomyScheduler — pause / resume / step")`). What does not exist is
  the *global* `system_config` pause key this ticket's Direction consumes from
  generation flow control. The `system_config` table and its generic
  `getConfigValue`/`setConfig` CRUD exist (`src/admin/config.ts:51,60`), so a
  key could be added cheaply, but no generation-pause key is among the seeded
  defaults (`registration_open`, `session_timeout_hours`, `max_sessions_per_user`,
  `max_upload_size_bytes`, `log_retention_days`, `archive_retention_days`,
  `default_provider`, `default_model`, `auto_moderation`, `profanity_filter`,
  `spam_detection`, `max_flags_before_hide`) and no call site reads any pause key —
  the only runtime `getConfigValue` reads are `archive_retention_days`,
  `nsfw_allow`, `nsfw_min_age` and `profanity_filter`. So there is no mid-loop
  global abort of an in-flight dispatch.
- **Per-actor cost ledger.** `autonomy_budget` (migration
  `026_autonomy_budget.ts`, `AutonomyBudget` in `src/db/schema-core.ts:1383`) counts
  actions per rolling window; its columns are scope_kind, scope_id, limit_name,
  count and timestamps — no token, model, or cost column — and no other table
  records spend against an autonomous actor. The nearest existing plumbing is
  `TokenUsage.estimatedCost?` in `src/generation/gen-types-results.ts:61`, carried
  on `GenerationResult.tokenUsage` (line 35), computed per request and never joined
  to a per-actor ledger.

Both gaps belong in a fresh ticket filed against `TASK-autonomy-rate-governor`,
not here — re-filing them under this epic is what created the duplicate in the
first place.

