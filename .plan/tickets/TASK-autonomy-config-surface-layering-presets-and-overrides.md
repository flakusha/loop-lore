# TASK: Autonomy config surface layering presets and overrides

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-actor-autonomy-story-drive.md

## Summary

Configuration layering and UX affordances for autonomy pacing: world default, chat override, per-actor override; pacing presets; gated unlimited stress preset. Epic: epic-actor-autonomy-story-drive.md. Consumed by TASK-autonomy-rate-governor-for-llm-actors and TASK-story-auto-drive-scheduler-world-tick-and-actor-turns.

## Direction

1. Layered config: world autonomy default <- chat override <- per-actor override; each layer may set budgets, cooldown/jitter spread, enabled/disabled, tick source.
2. Pacing presets: serene (few, slow actions), organic (default; varied cadence), brisk (dense interactions); presets expand to concrete budget/jitter numbers, still overridable.
3. Unlimited stress preset: dev-builds only, config-validated refusal elsewhere; intended for headless flow stress-testing without human in loop; pairs with cost logging always on.
4. Config surfaces through existing config sections pattern (src/config/sections/) + validation schemas; chat settings modal gains autonomy block; world settings gains default block.
5. Observability: current budgets, consumption, next-due actors visible in settings + telemetry.

## Acceptance

- [ ] Precedence verified: per-actor > chat > world > preset defaults.
- [ ] Unlimited preset refused outside dev builds (config validation test).
- [ ] Preset switching changes observed cadence in a scheduler integration test.
- [ ] Settings UI shows live budget consumption per actor.

