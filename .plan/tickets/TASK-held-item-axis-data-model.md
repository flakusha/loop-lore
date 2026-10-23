<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Held item axis data model

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Caveats:** TOCTOU: the held slot and the equip slots are mutually exclusive per item, so a read-modify-write of the item's slot can race. Security: none — the slot is server-set. Authorization: the item must belong to the actor whose slot is written. Parallelism: two equips into the same slot — last write wins, and the loser is pinned by a test. Lock/unlock lifecycle: none. Partial failure: the migration must backfill the new slot from the existing equip state without data loss. Rollback: drop the new slot/flag — the equip path is unchanged. Stale state: an item recorded as held whose row was deleted degrades to unequipped. Data races: none beyond the slot write. Idempotency: re-equipping the same item into the held slot is a no-op. Observability: the resolved slot is visible on the item row.

**Summary:**

Give held items a first-class representation: add a held equip slot (or an explicit held flag) so slotForCategory stops collapsing every non-weapon/armor category into accessory, and define the interaction with the wardrobe binding row. Today a torch, a book and a ring are indistinguishable, and no held/in-hand column exists.

**Context:**

There is **no held concept** in the data model today:

- "Carrying" = an `actor_items` row exists.
- "Equipped" = `actor_items.equipped = 'equipped'` (`EquipState` =
  `unequipped|equipped`, `src/db/enums-core/flags.ts:31-36`).
- "Worn as part of an outfit" = bound via `actor_wardrobe` AND equipped —
  combined in exactly one place, the read-only loadout bridge
  (`src/characters/services/wardrobe/loadout-bridge.ts:59-68`).
- Equip slots are only `weapon|armor|accessory`
  (`src/services/actor-items/equip.ts:13`) and `slotForCategory` collapses
  **every** other category into `accessory` (`:22-46`) — a torch, a book and a
  ring are indistinguishable.

`TASK-held-item-whole-outfit-variant-axis` assumes a "held item" can be
expressed at all; there is no held/in-hand column or slot, so that item has no
data to hang on.

The epic's answer for held items is a **whole-outfit variant axis** (curated
`wardrobe_items.tags` such as `hands-free` / `battle-wielding`), explicitly not
layered compositing — the epic's own Non-Goal. This ticket supplies the data
model that axis needs; it does not pick the variant set.

Alternative considered: a boolean `held` flag on `actor_items` instead of a new
slot. Both are viable; the slot keeps the equip vocabulary in one place and
lets the existing `slotForCategory` mapping stay a single function — decide at
write time and record the choice in the epic.

**Acceptance Criteria:**

- [ ] A held item has a first-class representation (an equip slot `held` or an
      explicit held flag) so `slotForCategory` stops collapsing a torch, a book
      and a ring into `accessory`.
- [ ] The interaction with the wardrobe binding row is defined: which instance a
      held outfit variant binds to, and what happens to that binding when the
      instance is consumed or transferred away.
- [ ] The chosen representation (tag member vs column vs flag) is recorded in
      `epic-reactive-actor-appearance.md` with the JSON-tag-first precedent.
- [ ] The existing equip/unequip behaviour is unchanged for non-held items.
- [ ] Tests passing; `bun run typecheck` and `bun run lint` clean.
