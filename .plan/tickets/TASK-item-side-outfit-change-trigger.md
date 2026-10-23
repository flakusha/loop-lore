<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Item-side outfit change trigger

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Caveats:** TOCTOU: the trigger fires from the item mutation, so it must not read uncommitted item state. Security: none — the trigger is server-side and takes no user input. Authorization: the change request must name the actor that owns the item; a request for another actor is rejected. Parallelism: two triggers for one actor coalesce into a single change request. Lock/unlock lifecycle: none. Partial failure: a change-gate rejection must not fail the item mutation. Rollback: remove the trigger call — the item mutation is unaffected. Stale state: a deleted `actor_items` row leaves a dangling `actor_wardrobe.item_instance_id` (`ON DELETE SET NULL`, `src/db/migrations/031_wardrobe.ts:72`) that the loadout bridge's inner join silently ignores (`src/characters/services/wardrobe/loadout-bridge.ts:61`). Data races: two actors' items in one transfer produce two requests, not one. Idempotency: the same trigger fired twice must not double-apply. Observability: the request logs the initiator and the source event.

**Summary:**

An unequip, transfer-away, item-row deletion or item-bound change must emit an outfit-change request through requestOutfitChange (initiator gm), so the rendered avatar drops the held-item variant and falls back to the default outfit while the wardrobe item stays in the inventory. The epic's phase 2 is entirely narration-driven; the item subsystem is a separate event source with no producer today.

**Context:**

The epic's phase 2 is entirely narration-driven (a hook reads the assistant reply).
The user scenario "the character removes an item to the inventory → the portrait
holding the item is replaced by the default-outfit portrait, the wardrobe item
stays in the inventory" is an **item-subsystem event**, not a narration event,
and nothing today turns an unequip, transfer, or item-row deletion into an
outfit change. The epic has no work item for it.

The producer side is empty, the seam is live:

- Change gate: `requestOutfitChange`
  (`src/characters/services/wardrobe/change-gate.ts:71-79`), one production
  caller today (`src/routes/wardrobe-overrides.ts:100-106`). The gate bypasses
  `npc` **and** `world_rule` (`change-gate.ts:75-77`, enum `:24`).
- Item events that take an item out of the actor's possession (verified
  2026-10-23): equip/unequip flips (`src/services/actor-items.ts:155-198`,
  `:207-217`); a transfer that empties the stack deletes the sender's row
  (`src/services/actor-items/transfer.ts:74`, the receiving copy is inserted
  `Unequipped` at `:113`); a crafting recipe empties a material stack
  (`src/rpg/crafting/process.ts:149`); a battle consumes an inventory unit
  (`src/rpg/service/battles/items.ts:239`).
- `equip()`/`unequip()` have **no wardrobe side effects** today (zero
  `wardrobe` matches in `src/services/actor-items.ts`);
  `bindWardrobeItemInstance`
  (`src/characters/services/wardrobe/bindings.ts:21-62`) is called only from
  `src/routes/wardrobe-bindings.ts:61`.
- The loadout bridge is **off by default**
  (`system_config.wardrobe_loadout_bridge`, `loadout-bridge.ts:26-41`) and
  writes nothing by design (`loadout-bridge.ts:18-19`).
- The render path is already live, so the trigger has a working target: the
  read route resolves each row's outfit server-side
  (`src/routes/messages/read.ts:79-87` → `attachMessageAvatars`).

Alternative considered: a second, item-flavoured gate initiator. Rejected —
`requestOutfitChange` already takes an initiator, and the epic's own
initiator-mapping item forbids `npc` and `world_rule` for extracted narration;
the item path uses the same `gm` initiator so one gate rule covers both.

**Acceptance Criteria:**

- [ ] An unequip, a transfer-away that empties the stack, and a consumed or
      deleted item row each emit an outfit-change request for the owning actor.
- [ ] The request passes the change gate with initiator `gm`; `npc` and
      `world_rule` never bypass it.
- [ ] The wardrobe item stays in the inventory — the trigger changes the
      resolved outfit only, it never deletes a wardrobe row.
- [ ] After the trigger, the actor's rendered avatar falls back to the
      default-outfit variant and the held-item variant is no longer selected.
- [ ] No DB write happens while the loadout bridge flag is off.
- [ ] Tests passing; `bun run typecheck` and `bun run lint` clean.
