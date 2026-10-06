<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-056: Overpowered Item Management

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Summary:** ItemPowerBudget keyed by ItemCategory; sits above TASK-052/053.
**Context:** Admin audit endpoint + balance cap enforcement.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: Done
**Priority**: medium
**Tags**: items, rpg, balance, security
**Epic:**: epic-items
**Assignee**:

## Summary

Caps and audits item power so generated/imported items cannot break balance. Adds a power budget per item category (max stat deltas, max effect count, max durability cap), an LLM-side gate that rejects over-budget item drafts, and an admin audit surface listing the top-N most powerful items per world. Sits alongside TASK-052 (effects) and TASK-053 (drift) as the balance layer above them.

## Context

- Effect surface: `ItemEffect` schema (TASK-052) — power budget must constrain total `stat_delta` magnitudes and `on_use` payload size.
- Drift surface: TASK-053 drift multipliers accumulate; the power budget must include drift caps.
- Stats engine: `src/rpg/stats/validation.ts` already validates stat ranges for character creation; mirror its shape for items.
- LLM tool: `src/generation/tools/create-item.ts` is the natural enforcement point.
- Admin surface: existing admin dashboards under `src/plugins/mount-points.ts` (`admin.dashboard`) host the audit page.
- Upstream: depends on `ItemCategory`/`ItemRarity` enums (`src/db/enums-story/items.ts`) and the effects schema (TASK-052).

## Acceptance Criteria

- `ItemPowerBudget` lives in `src/story/items/balance.ts` keyed by `ItemCategory`: `{ maxStatDelta: number, maxEffectCount: number, maxDurability: number, maxDriftPct: number }`.
- `validateItemPower(definition: ItemDefinition, instance: ItemInstance): ValidationResult` returns `{ ok: false, reason }` when any field exceeds the budget.
- LLM item tool calls `validateItemPower` before insert; over-budget drafts fail with a typed error that includes the offending field.
- Admin audit endpoint lists top-N most powerful `world_items` per `worldId`, ranked by `(maxStatDelta + sum(drift) + maxDurability)`; exposed at `GET /api/admin/worlds/:worldId/items/power-audit`.
- Drift over-cap (TASK-053) is also gated by `validateItemPower`; a drifting unique item cannot exceed its budget.

## Related Files

- `src/story/items/balance.ts` *(speculative)* — `ItemPowerBudget` + validator.
- `src/rpg/stats/validation.ts` *(existing)* — reference validation pattern.
- `src/generation/tools/create-item.ts` *(existing)* — LLM gate.
- `src/routes/admin/` *(speculative)* — audit endpoint.

## Notes

- Speculative items are marked; verify against current `src/routes/` and `src/story/items/` before implementation.
- Power budget defaults are TBD pending balance pass; start conservative and tune in epic.
- Per-rarity budget overrides (`ItemRarity.Unique` may exceed normal budget) — coordinate with TASK-054 unique tracking.
- Audit endpoint must respect existing `requireUserId`/RBAC authz (see `src/middleware/`).

**Resolved:** 2026-10-04 registry-driven close: git issue 78fd61b (registry tip: 782336168 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-056 done)

## Resolution

Per-category power budgets ship as the balance layer above TASK-052 (effects)
and TASK-053 (drift), which were left untouched.

- `ItemPowerBudget` + `ITEM_POWER_BUDGETS` keyed by `ItemCategory` at
  `src/story/items/balance.ts:26`.
- `validateItemPower` returns `{ ok: false, field, reason }` in a fixed check
  order (statDelta, effectCount, maxDurability, drift) so `field` is
  deterministic — `src/story/items/balance.ts:135`.
- LLM tool calls `validateItemPower` before insert and throws
  `ItemPowerBudgetError` carrying the offending field —
  `src/generation/tools/create-item.ts:21` (import) and the gate in the handler.
- Drift over-cap is enforced at the source: `DRIFT_CAPS` moved into
  `balance.ts:47` and `driftCapFor` (`src/story/items/balance.ts:64`) returns the
  tighter of the rarity cap and the category budget. `applyDrift` now clamps
  through it — `src/story/items/instance-state.ts:104`. A unique item's rarity
  cap is `Infinity` by design, so the category budget is what bounds it.
- Admin audit endpoint `GET /api/admin/worlds/:id/items/power-audit`
  (`requireUserId` + `can(role, "admin.system")` authz, matching sibling admin
  routes; the path param is `:id` to match `/admin/worlds/:id` — memoirist
  rejects two names at the same path position) — `src/routes/admin/item-power.ts`;
  registered at `src/routes/admin/index.ts`.
- Route tests: `src/routes/admin/item-power.test.ts` (401/403, ranking,
  empty world, `?limit=` clamping, 422 on a non-uuid id).
- Ranking helper `rankItemPower` (score = `maxStatDelta + sum(drift) +
  maxDurability`, ties broken on `worldItemId`) at `src/story/items/balance.ts:191`.
  Definitions are resolved by `itemId`, never by name.
- Tests: `src/story/items/balance.test.ts` (validator precedence, budget
  boundaries, unique-item drift bound) and `src/story/items/rank-power.test.ts`
  (ranking, tie-break, id-vs-name resolution).

**Note on budget values:** defaults are conservative placeholders as the
ticket's Notes anticipate; they need tuning during the epic balance pass.
Per-rarity budget *overrides* (letting a unique item exceed the normal ceiling)
are not implemented — the category budget is the single ceiling for now.

**Resolved:** 2026-10-04 registry-driven close: git issue 78fd61b (registry tip: 782336168 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-056 done)
