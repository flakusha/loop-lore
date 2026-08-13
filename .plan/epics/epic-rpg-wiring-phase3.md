# EPIC: RPG Wiring Completion — Phase 3

**Status:** 🟡 In Progress (backend items/trade/crafting-recipes/loot landed 2026-08-12)
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** rpg, wiring, routes, items, crafting, trade, loot, services

## Summary

Finish wiring the RPG service layer into production routes. `src/rpg/` contains many
complete services with **zero HTTP consumers** — the backend work landed in worktree
`rpg-wire-routes` (2026-08-12) closes the item-systems subset; this epic tracks the rest
and the deferred execution/UX follow-ups. Derived from `../open.md` § Dead/unwired #12–13
and `epic-item-systems-unification.md` "Remaining Points".

## Landed (2026-08-12, worktree `rpg-wire-routes`, 13 commits)

- Item taxonomy unification (`TASK-unify-item-types.md`)
- NPC inventory → `world_items.owner_actor_id` (`TASK-link-npc-inventory.md`)
- Actor items service: equip/carry/transfer (`TASK-actor-item-service.md`); `actor_items.value` int (`TASK-fix-actor-item-value-type.md`)
- World items → battle equipment (`TASK-map-battle-equipment.md`)
- Loot persisted as world items (`TASK-persist-loot-drops.md`); `world_items.quantity` CHECK
- Item-transfer event handler + extraction emission (`TASK-implement-item-transfer-event.md`)
- Crafting recipe CRUD over HTTP (`TASK-wire-crafting-routes.md` — recipes part)
- Currency ledger + atomic two-sided trade (`TASK-implement-trade.md` — offer/accept part)
- Transfer orphan cleanup (`TASK-clean-transfer-orphans.md`)

## Remaining wire tasks (services still unreachable from HTTP)

| Ticket | Scope | Priority |
|--------|-------|----------|
| `TASK-wire-achievements-routes.md` | Achievements service → HTTP | P1 |
| `TASK-wire-skills-routes.md` | Skills service → HTTP | P1 |
| `TASK-wire-quests-routes.md` | Quests — after `TASK-consolidate-quest-engines.md` | P1 |
| `TASK-consolidate-quest-engines.md` | Dual quest system (`rpg/quests` vs `story/quest-engine`) → single | P1 |
| `TASK-wire-npc-navigation-routes.md` | NpcNavigation service → HTTP | P2 |
| `TASK-wire-replayability-routes.md` | Replayability service → HTTP | P2 |
| `TASK-wire-world-location-traits-routes.md` | WorldLocationTraits service → HTTP | P2 |
| `TASK-wire-xp-loot-routes.md` | XP/loot exports (`rpg/service`) → HTTP | P2 |
| `TASK-wire-combat-routes.md` | Combat service → HTTP (battle UI glue in `src/battle/` already shipped) | P2 |
| `TASK-complete-crafting-system-services.md` | StationsService + CraftingProcessService gaps | P1 |
| `TASK-crafting-stations-execution.md` | ⬜ NEW — station CRUD, `POST /craft` execution, orders via HTTP | P1 |
| `TASK-trade-history-npc-counterparty.md` | ⬜ NEW — trade history query + NPC counterparty wrapper | P2 |

## Item frontend / UX (deferred from backend, tickets exist)

- `TASK-item-provisioning-dashboard.md` — world-level allocation view (P1)
- `TASK-npc-inventory-frontend.md` — view NPC inventories + trade with NPCs (P1)
- `TASK-equipment-stat-preview.md` — live stat delta preview on equip/unequip (P1)
- `TASK-item-generation.md` — procedural + LLM-assisted item generation (P2)
- `TASK-item-edit-permissions-history.md` — edit permissions + provenance audit trail (P2)

## Deferred (not in this epic)

- RPG subsystems beyond wiring: magic, factions, housing, social, weather, disease,
  stealth, companion/pet, agency/story-points, resolution family — all P6+
  (see `cross-mechanics-integration-matrix.md`).

## Definition of Done

- All remaining wire tickets shipped + ownership-gated (world owner/admin)
- `bun test src/` green; `bun run check` green
- OpenAPI docs generated for new endpoints
- Item frontend tasks closed (provisioning dashboard, NPC inventory UI, equipment preview)
