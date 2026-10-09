<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Autonomy config surface layering presets and overrides

**Summary:** Layered autonomy pacing config (world default <- chat override <- per-actor override), pacing presets, a dev-gated unlimited stress preset, and live budget observability. Closed as a duplicate: the shipped surface is `TASK-autonomy-config-surface` (Done), which meets all four criteria below.
**Context:** Filed twice under `epic-actor-autonomy-story-drive`. `TASK-autonomy-config-surface.md` (git issue `d08a0f2`, **Done**) implements the identical scope in `src/autonomy/config/`; the Duplicate-of section below carries the file:symbol evidence. `**Epic:**` was corrected from the non-existent id `epic-actor-autonomy-story-drive.md` to `epic-actor-autonomy-story-drive`.
**Acceptance Criteria:**
- [x] Precedence verified: per-actor > chat > world > preset defaults.
- [x] Unlimited preset refused outside dev builds (config validation test).
- [x] Preset switching changes observed cadence in a scheduler integration test.
- [x] Settings UI shows live budget consumption per actor.


**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-actor-autonomy-story-drive

## Summary

Configuration layering and UX affordances for autonomy pacing: world default, chat override, per-actor override; pacing presets; gated unlimited stress preset. Epic: epic-actor-autonomy-story-drive. Consumed by TASK-autonomy-rate-governor-for-llm-actors and TASK-story-auto-drive-scheduler.

## Direction

1. Layered config: world autonomy default <- chat override <- per-actor override; each layer may set budgets, cooldown/jitter spread, enabled/disabled, tick source.
2. Pacing presets: serene (few, slow actions), organic (default; varied cadence), brisk (dense interactions); presets expand to concrete budget/jitter numbers, still overridable.
3. Unlimited stress preset: dev-builds only, config-validated refusal elsewhere; intended for headless flow stress-testing without human in loop; pairs with cost logging always on.
4. Config surfaces through existing config sections pattern (src/config/sections/) + validation schemas; chat settings modal gains autonomy block; world settings gains default block.
5. Observability: current budgets, consumption, next-due actors visible in settings + telemetry.

## Acceptance

- [x] Precedence verified: per-actor > chat > world > preset defaults.
- [x] Unlimited preset refused outside dev builds (config validation test).
- [x] Preset switching changes observed cadence in a scheduler integration test.
- [x] Settings UI shows live budget consumption per actor.

## Duplicate of

`TASK-autonomy-config-surface.md` (Status: **Done**, git issue `d08a0f2`) — the same
work, filed twice in this epic. Every acceptance criterion above is already met
and tested by the shipped config surface: `resolveAutonomyConfig`
(`src/autonomy/config/resolver.ts`) implements the per-actor > per-chat > per-world >
preset precedence, and `src/autonomy/config/resolver.test.ts` proves it in
`describe("resolveAutonomyConfig — layering precedence")` (7 tests, including
"actor override wins over chat and world" and "chat preset wins over world; world-set
scalar survives"), while `describe("dev-only gating")` (4 tests) proves the
unlimited-stress preset throws `UnboundedStressGatedError` under
`NODE_ENV=production` at both the preset registry (`getPreset`) and the resolver
(`resolveAutonomyConfig`, world layer). Preset switching is asserted end to end: `src/autonomy/config/config-api.test.ts`
("a chat preset saved through updateChat overrides the world one") checks the
resolved `cfg.tickIntervalMs` flips to `PRESETS.serene.tickIntervalMs`, and the
scheduler advances the cursor by exactly that resolved value (the `#advance(...,
cfg.tickIntervalMs)` call in `src/autonomy/scheduler/index.ts`, asserted in
`src/autonomy/scheduler/index.test.ts`, "moves an NPC through the existing
pipeline and advances the cursor"). The last box is covered by the Done
ticket's routes and UI: `src/routes/worlds/autonomy-routes.test.ts` reads back
the budget line from `GET /api/worlds/:worldId/autonomy`, and
`tests/e2e/flows/browser/autonomy-panel.browser.ts` drives the per-character
override save end to end. Nothing here is unimplemented, so this file is closed
as a duplicate rather than worked.

// hint: Logic changed on both sides. Requires understanding intent of each change.
`Wontfix` recorded 2026-10-02; `**Epic:**` corrected from the non-existent id
`epic-actor-autonomy-story-drive.md` to `epic-actor-autonomy-story-drive`. Status
history: `Wontfix` from 2026-10-02 until the 2026-10-08 registry close, `Done`
since and permanently — see the registry note below.

**Registry note:** git issue `db98e0e` closed 2026-10-08 during issue reconciliation (registry tip: 1fd08e96a). The git issue registry is binary open-or-closed and has no `Wontfix` state, so `giwt sync` maps a closed issue to `Done` unconditionally and rewrites any non-done `.md` status line back to `Done` (`checkMdStatusDrift`, `sync-reconcile-checks.ts`). `Done` is therefore this ticket's permanent status: do NOT reset it to `Wontfix`, `Not Started`, or anything else — sync flips it back on the next run, and the flip-flop has cost three passes.

`Done` here means *closed as a duplicate*, not *this work shipped*. The work shipped under `TASK-autonomy-config-surface` (Done), which meets all four acceptance criteria above; the evidence is in the Duplicate-of section. Nothing remains open from this file.

**Resolved:** 2026-10-08 registry-driven close: git issue db98e0e (registry tip: 1fd08e96a Konstantin Fedotov Close issue)
