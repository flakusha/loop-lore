# TASK: Battle-Item Integration

**Epic:** Battle & Action Systems, Item System Extensions
**Priority:** High
**Effort:** High
**Status:** 🟡 Partially Complete — superseded backend by `TASK-map-battle-equipment`; durability-in-combat/combat-equipment-use open (2026-08-12)
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G1 (Battle ↔ Items)

## Summary

Integrate the battle system with the items/inventory system so that combat uses equipment, loot feeds inventory, and item durability degrades in combat.

## Background

Battle currently uses "Use item" as an action type but never references `epic-item-system-extensions` or the inventory system for loadout/equipment management. There is no loot-drop-to-inventory pipeline. This gap blocks proper equipment-based combat progression.

## Integration Points

- Battle actions reference items for equipment (weapon, armor, shield)
- Loot drops from defeated enemies feed into inventory
- Item durability degrades per use in combat
- Equipment affects battle stats (damage, AC, saves)

## Open Questions

- Should equipment be bound on pickup or tradeable?
- What is the durability degradation model (per-hit, per-round, fixed)?
- How do magical items interact with combat mechanics?

## Cross-References

- `.plan/cross-mechanics-integration-matrix.md` — Gap G1
- `.plan/epics/epic-battle-action-systems.md` — Battle epic
- `.plan/epics/epic-item-system-extensions.md` — Items epic
- `docs/spec/battle.md` — Battle spec (newly created)
- `docs/spec/items.md` — Items spec
- `docs/spec/inventory.md` — Inventory spec
- `docs/spec/rpg-mechanics.md` — RPG stats that feed combat

## Acceptance Criteria

- [ ] Battle action uses equipment from inventory for stat calculations (partially — `calculateEquipmentModifiers`/`canEquipItem` exist; not wired to battle actions)
- [x] Enemy defeat triggers loot drop into inventory (via `generateLoot` + `POST /api/battle/equipment/loot` persistence)
- [ ] Item durability decreases on combat use (open — `applyDurabilityDamage` exists but no combat hook)
- [x] Equipment affects at least one combat stat (damage, AC, or save) (via `toEquipmentItem` → `EquipmentModifier[]` / `calculateEquipmentModifiers`)

### Superseded / carried forward (2026-08-12)

Most of this ticket's backend surface shipped under `TASK-map-battle-equipment.md` (✅ Complete):
equipment→battle mapping (`toEquipmentItem`, `categoryToType`/`categoryToSlot`, `EquipmentSource`),
stat modifiers (`calculateEquipmentModifiers`), equip eligibility (`canEquipItem`), durability
repair/apply helpers, and loot generation (`generateLoot`). The remaining open items above
(combat-action equipment usage + durability degradation in combat) are carried forward and
tracked under `epic-item-systems-unification` → `epic-battle-integration-gaps`.
