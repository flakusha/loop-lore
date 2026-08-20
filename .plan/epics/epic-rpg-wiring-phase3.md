<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RPG Wiring Completion — Phase 3

**Status:** 🟡 In Progress (7 services wired + quest consolidation `51a7bc01` 2026-08-14; crafting/trade/battle execution shipped `49ee5c1a` 2026-08-18)
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** rpg, wiring, routes, items, crafting, trade, loot, services

## Summary

Finish wiring the RPG service layer into production routes. `src/rpg/` contains many
complete services with **zero HTTP consumers** — the item-systems subset landed in
worktree `rpg-wire-routes` (2026-08-12), and **7 more services were wired directly
on `dev` (`51a7bc01`, 2026-08-14)** with a wiring gate (`scripts/check-wiring.ts`)
added to catch future unwired services. The **crafting/trade/battle execution subset**
landed in worktree `feature/a8-unwired-closeout` (`49ee5c1a`, 2026-08-18). This epic
now tracks only the remaining frontend/UX follow-ups. Derived from `../open.md` §
Dead/unwired #12–13 and `epic-item-systems-unification.md` "Remaining Points".

## Landed

### (2026-08-12, worktree `rpg-wire-routes`, item-systems subset)

- Item taxonomy unification (`TASK-unify-item-types.md`)
- NPC inventory → `world_items.owner_actor_id` (`TASK-link-npc-inventory.md`)
- Actor items service: equip/carry/transfer (`TASK-actor-item-service.md`); `actor_items.value` int (`TASK-fix-actor-item-value-type.md`)
- World items → battle equipment (`TASK-map-battle-equipment.md`)
- Loot persisted as world items (`TASK-persist-loot-drops.md`); `world_items.quantity` CHECK
- Item-transfer event handler + extraction emission (`TASK-implement-item-transfer-event.md`)
- Crafting recipe CRUD over HTTP (`TASK-wire-crafting-routes.md` — recipes part)
- Currency ledger + atomic two-sided trade (`TASK-implement-trade.md` — offer/accept part)
- Transfer orphan cleanup (`TASK-clean-transfer-orphans.md`)

### (2026-08-14, `51a7bc01`, on `dev`)

- **7 services wired to HTTP** with routes + schemas + tests:
  - Achievements (`src/routes/rpg/achievements.ts`)
  - Skills (`src/routes/rpg/skills.ts`)
  - NPC navigation (`src/routes/rpg/npc-navigation.ts`)
  - Replayability (`src/routes/rpg/replayability.ts`)
  - World-location traits (`src/routes/rpg/world-location-traits.ts`)
  - XP/loot (`src/routes/rpg/xp-loot.ts`)
  - Combat (`src/routes/rpg/combat.ts`)
- **Quest engine consolidation** — dual system removed (`src/rpg/quests/service/` deleted; single engine remains)
- **Wiring gate** — `scripts/check-wiring.ts` + `check` integration

### (2026-08-18, `49ee5c1a`, worktree `feature/a8-unwired-closeout`)

- **Crafting stations** — station defs CRUD (`station-defs.ts`, 187L) + station instances CRUD (`station-instances.ts`, 146L), barrel in `stations.ts` (24L)
- **Crafting attempts** — `POST /craft` + list/detail (`attempt.ts`, 152L), backed by `CraftingProcessService`
- **Crafting orders** — `CraftingOrderService` (`orders.ts`, 186L) with place/accept/fulfill/cancel + payment via `TradeService.trade`
- **Combat equipment durability** — migration `048` (+durability/max_durability on `actor_items`) + `POST /battle/equipment/combat-use` (`equipment-durability.ts`, 126L)
- **LoRA routes** — `loraRoutes({config})` wired in `register-plugins.ts`
- **DB schema artifacts regenerated** after migration 048
- **20/20 unit tests**, full gate 22/22 green

## Remaining wire tasks (services still unreachable from HTTP)

| Ticket | Scope | Priority | Status |
|--------|-------|----------|--------|
| `TASK-complete-crafting-system-services.md` | StationsService + CraftingProcessService gaps | P1 | ✅ DONE (2026-08-18, A8 closeout) |
| `TASK-crafting-stations-execution.md` | Station CRUD, `POST /craft` execution, orders via HTTP | P1 | ✅ DONE (2026-08-18, A8 closeout) |
| `TASK-trade-history-npc-counterparty.md` | Trade history query + NPC counterparty wrapper | P2 | ✅ DONE (IS4-IS6 already wired) |
| `TASK-battle-item-integration.md` | Combat-action equipment usage + durability degradation in combat | P2 | ✅ DONE (2026-08-18, migration 048 + route) |

## Item frontend / UX (deferred from backend, tickets exist)

- `TASK-item-provisioning-dashboard.md` — world-level allocation view (P1)
- `TASK-npc-inventory-frontend.md` — view NPC inventories + trade with NPCs (P1)
- `TASK-equipment-stat-preview.md` — live stat delta preview on equip/unequip (P1)
- `TASK-item-generation.md` — procedural + LLM-assisted item generation (P2)
- `TASK-item-edit-permissions-history.md` — edit permissions + provenance audit trail (P2)

## Deferred (not in this epic)

- RPG subsystems beyond wiring: magic, factions, housing, social, weather, disease,
  stealth, companion/pet, agency/story-points, resolution family — all P6+
  (see `matrix-cross-mechanics.md`).

## Definition of Done

- All remaining wire tickets shipped + ownership-gated (world owner/admin)
- `bun test src/` green; `bun run check` green
- OpenAPI docs generated for new endpoints
- Item frontend tasks closed (provisioning dashboard, NPC inventory UI, equipment preview)
