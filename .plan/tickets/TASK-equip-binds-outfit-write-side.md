<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Equip binds outfit (write side)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Caveats:** Precedence hazard: the equipped-loadout rung sits **above** the character default but **below** the chat override (`src/characters/services/wardrobe/resolve.ts:164-188`), so flipping the bridge flag on can shadow a default a narrative hook just wrote — pin the precedence with a test. TOCTOU: equip is a service call concurrent with render resolution; the write must be atomic per actor. Security: an equip must not bind an item the actor does not hold — `bindWardrobeItemInstance` already enforces this (`src/characters/services/wardrobe/bindings.ts:30-37`) and that check must not be bypassed. Authorization: unchanged by this ticket. Rollback: the flag already gates the read-side rung; adding writes does not change the flag default. Stale state: an unequipped item with a live binding is inert (the bridge joins on `equipped = EquipState.Equipped`). Idempotency: equipping an already-bound instance is a no-op (`bindings.ts:39-47`). Observability: log bind and unbind.

**Summary:**

`equip()` / `unequip()` have no wardrobe side effects today, so the
loadout bridge can never see a binding that equip created. Write the binding.

**Context:**

The predecessor deferred exactly this slot and closed the epic anyway.
`epic-wardrobe-avatar-variants.md:101-104` records the work item as
**"Deferred phase — equipped-items → outfit auto-mapping (flag-gated)"** with
the note *"flag `system_config.wardrobe_loadout_bridge` default off; read-side
rung only — no equip-time writes yet."* This ticket supplies the missing write
side.

**The read side exists and is read-only by design.**
`src/characters/services/wardrobe/loadout-bridge.ts:18-19` states it: *"nothing
here writes on equip — the rung re-derives from equipped state + bindings at
resolve time."* `resolveEquippedOutfit`
(`loadout-bridge.ts:55-71`) joins `actor_wardrobe` to `actor_items`, filters on
`equipped = EquipState.Equipped`, and picks the newest binding
(`created_at desc`, `id desc` as a total-order tie-break).

**So the gap is exactly one thing:** `equip()` and `unequip()`
(`src/services/actor-items.ts:155-198` and `:207-217`) update
`actor_items.equipped` and nothing else. `actor_wardrobe` is written only by the
explicit CRUD path (`bindWardrobeItemInstance`,
`src/characters/services/wardrobe/bindings.ts:21-62`). Nothing links "this
actor equipped this instance" to "this outfit".

**Two things must be decided, and both are traps:**

1. **Which wardrobe item does an equip bind to?** The mapping is not free: a
   `weapon` category item may map to a `battle-wielding` outfit, an `armor` item
   to a matching set. The bridge's existing join is
   `actor_wardrobe.item_instance_id → actor_items.id` — so the wardrobe item
   must already exist as a row; equip binds an *instance* to an existing
   wardrobe item. If no wardrobe item matches, equip binds nothing (it must not
   invent one).
2. **Should the flag be flipped on?** No. Leave
   `wardrobe_loadout_bridge` default off
   (`loadout-bridge.ts:26-41`: enabled only when the value is exactly `"true"`).
   This ticket adds writes; it does not change which rung wins by default. The
   epic's own precedence concern is that the equipped rung sits above the
   character default (`resolve.ts:178-186`).

**Slot taxonomy is narrow, and that constrains the mapping.**
`EQUIP_SLOTS` is `weapon | armor | accessory`
(`src/services/actor-items/equip.ts:13-15`), and `slotForCategory`
(`equip.ts:22-46`) maps *every* non-weapon/armor category — consumables, key
items, tools, books — to `accessory`. `actor_items` has no `equipped_slot`
column; the slot is re-derived from `item_type` at runtime. So a worn garment and
a held prop are indistinguishable in the data. This ticket must not try to fix
that (it is the layering question, handled separately); it binds by explicit
mapping, not by inference from slot.

**Acceptance Criteria:**

- [ ] `equip()` (`src/services/actor-items.ts:155-198`) writes a
      `actor_wardrobe` binding through `bindWardrobeItemInstance`
      (`src/characters/services/wardrobe/bindings.ts:21-62`) when a wardrobe item
      matches
- [ ] `unequip()` (`:207-217`) removes or deactivates that binding
- [ ] An equip with no matching wardrobe item writes nothing and does not throw
- [ ] The binding write preserves the existing actor-ownership check — an item
      the actor does not hold is rejected
      (`src/characters/services/wardrobe/bindings.ts:30-37`)
- [ ] `wardrobe_loadout_bridge` remains **default off**
      (`loadout-bridge.ts:26-41`); a test asserts the default is off
- [ ] Precedence is pinned by a test: with the flag on, chat override still wins
      over equipped loadout, which still wins over the character default
      (`src/characters/services/wardrobe/resolve.ts:164-188`)
- [ ] Equipping the same instance twice produces one binding, not two
      (`loadout-bridge.ts` / `bindings.ts:39-47`)
- [ ] Unequipping an item with no binding is a no-op
- [ ] Tests pass; `bun run typecheck` and `bun run lint` clean

**Notes / Evidence:**

- The deferred slot: `epic-wardrobe-avatar-variants.md:101-104`
- The bridge's own statement that it writes nothing:
  `src/characters/services/wardrobe/loadout-bridge.ts:18-19`
- The read-side rung: `src/characters/services/wardrobe/loadout-bridge.ts:55-71`
- Flag name and default-off semantics:
  `src/characters/services/wardrobe/loadout-bridge.ts:26-41`
- `equip()` / `unequip()` with no wardrobe side effects:
  `src/services/actor-items.ts:155-198`, `:207-217`
- The binding writer to reuse: `src/characters/services/wardrobe/bindings.ts:21-62`
  (ownership check `:30-37`, idempotence `:39-47`)
- Resolution precedence this can shadow:
  `src/characters/services/wardrobe/resolve.ts:164-188` (chat override `:164-173`,
  location rule `:175-176`, equipped loadout `:178-183`, default `:185-186`)
- Slot taxonomy constraint: `src/services/actor-items/equip.ts:13-15` and
  `:22-46`
- Wardrobe item shape (flat; no slot or layer field):
  `src/characters/services/wardrobe/types.ts:8-21`