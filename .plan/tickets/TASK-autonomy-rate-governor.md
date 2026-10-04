<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Autonomy Rate Governor (per-agent/user budget caps)

**Status:** Done
**Priority:** high
**Effort:** Medium (budget tracker + UI + telemetry hooks)
**Summary:** Per-agent and per-user budget caps on autonomy actions — the rate-limiting layer that prevents runaway autonomy ticks from draining generation quota or flooding the chat timeline.
**Context:** Referenced by `epic-actor-autonomy-story-drive.md` Work Item list as `TASK-autonomy-rate-governor` and Concrete Implementation table row 7 (line 107). Listed as `TBD — needs filing` in the gap-audit (2026-09-23). The governor is a hard requirement of the autonomy subsystem: every `NpcNavigationService` tick and every story auto-drive scheduler beat must check budget before dispatching.

**Acceptance Criteria:**
- [x] Budget tracker with per-agent + per-user dimensions, persisted across restarts.
- [x] Configurable limits: per-tick action count, per-minute generation calls, per-hour beat dispatches.
- [x] Telemetry hooks: emit a `governor.budget.exceeded` event when a limit trips, with the agent/user/limit/timestamp payload.
- [x] UI surfacing in world settings + chat settings: budget remaining + reset window.
- [x] The story auto-drive scheduler respects the governor at every beat (no bypass paths).
- [x] Unit tests cover: budget tracking, limit-trip events, persistence across restarts, and the bypass-resistance assertion.
- [x] `bun run check` green.

## Implementation Notes

Shipped in `src/autonomy/governor/` (`AutonomyGovernor.tryConsume`), gated
by the tick driver and the scheduler before either dispatches work.

- Persistence: `autonomy_budget` (migration `026_autonomy_budget.ts`), one row
  per `(scope_kind, scope_id, limit_name)` carrying the window start and
  count, so budgets survive a restart.
- Limits: `LIMIT_CATALOG` fixes the three windows (per-tick action 60s,
  per-minute generation 60s, per-hour beat dispatch 1h); the numeric cap
  comes from the layered `AutonomyConfig` (`perAgentCap` / `perUserCap`),
  resolved per scope in `caps.ts`. A `null` cap is unbounded and skips all
  DB work.
- Telemetry: `governor.budget.exceeded` is recorded once per denial with the
  scope/limit/window payload, fire-and-forget — the row is deliberately left
  unmutated on denial so a denied consume cannot wedge the gate open.
- Internals: `cache.ts` holds a TTL read-through `BudgetCache` (ponytail:
  per-process; a multi-instance deploy needs a shared store or a much
  shorter TTL), `caps.ts` holds cap + config resolution, keeping
  `index.ts` under the 250-line size gate.
- The governor is a pure module — no scheduler, tick-driver, or cron
  dependency — so it is independently testable and reusable.

**Surfaced in the shared panel:** the budget line on the autonomy panel reads
from `GET /api/worlds/:worldId/autonomy?scopeKind=&scopeId=`, which `peek`s the
window — it never consumes. The cap for the peek comes from the config the
same request already resolved, not from a re-resolve, so the ceiling the page
shows is the one the tick loop charges against. An unbounded scope reports
`remaining: null` rather than a fake number.

**Epic:** epic-actor-autonomy-story-drive
**Tags:** autonomy, rate-limiting, budget, governor, telemetry, per-agent, per-user
**Related:** TASK-autonomy-config-surface, TASK-story-auto-drive-scheduler, epic-actor-autonomy-story-drive.md:70-72


git issue: 44dc2a8
