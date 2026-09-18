<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-056: Overpowered Item Management

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** ItemPowerBudget keyed by ItemCategory; sits above TASK-052/053.
**Context:** Admin audit endpoint + balance cap enforcement.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: items, rpg, balance, security
**Epic**: epic-items
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
