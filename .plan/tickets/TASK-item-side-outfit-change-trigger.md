<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Item-side outfit change trigger (unequip/transfer swaps the portrait)

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Tags:** outfit
**Caveats:** TOCTOU: the trigger reads the item's binding state, which another turn may change concurrently — the trigger re-reads state and treats a vanished binding as a no-op rather than a failure. Security: none new; no new endpoint and no new input reaches this path. Authorization: the outfit change must only ever be requested for the actor that owns the item instance — the trigger never accepts an actor id from the caller. Parallelism: two concurrent unequips of the same item must not produce two change requests — the request is deduplicated per (actor, item, state-transition). Lock/unlock lifecycle: none; the trigger holds no lock and must not be called while a transaction holds the item row. Partial failure: a gate refusal or a resolver throw must leave the equip-state flip intact and the turn intact — the item stays unequipped, the request is recorded as refused. Rollback: revert the trigger registration; no schema change and no data migration is involved. Stale state: an unequip whose item was already deleted is a no-op, never an error. Data races: the equip-state flip and the change request are not atomic — a crash between them must be recoverable, so the request is re-derivable from the item's current equip state. Idempotency: unequipping an already-unequipped item is a no-op and yields no request; the same unequip twice yields exactly one request. Observability: log each trigger with actor id, item id, initiator and gate verdict.

**Summary:**

The epic's phase 2 is narration-driven only. The user-visible scenario "a
character removes an item to their inventory -> the portrait holding that item is
replaced by the default-outfit portrait, the wardrobe item itself stays in the
inventory" is an ITEM-subsystem event, not a narration event. Nothing today
turns an equip-state flip or a transfer into an outfit change. This ticket adds
the item-side initiator that routes through the existing change-gate seam.

**Context:**

1. **Only two functions flip `equipped` on an existing row: `equip()` and
   `unequip()`.** Both live in `src/services/actor-items.ts:155-217` — `equip()`
   flips `equipped` to `EquipState.Equipped` (`:191-195`), `unequip()` flips it
   to `EquipState.Unequipped` (`:210-214`). Every other write to `equipped`
   inserts a NEW row already unequipped (`src/routes/actor-items.ts:56`,
   `src/rpg/crafting/process.ts:61`, `src/services/actor-items/transfer.ts:113`)
   — those are creations, not transitions.

2. **A transfer creates a NEW, unequipped row for the receiver.** The
   receiving copy is inserted with `equipped: EquipState.Unequipped` at
   `src/services/actor-items/transfer.ts:113` (the insert block is
   `:99-115`). The sender's row is decremented (`:76-80`) and DELETED outright
   when the transfer empties the stack (`:73-74`).

3. **`actor_items` rows ARE deleted — three production sites.** A grep for
   `deleteFrom("actor_items"` (note: no closing paren, the call sites write
   `deleteFrom("actor_items",)`) returns three hits in `src/`:
   `src/services/actor-items/transfer.ts:74` (the sender's row is DELETED when
   the transferred quantity empties the stack), `src/rpg/crafting/process.ts:149`
   (a recipe material whose stack empties), and
   `src/rpg/service/battles/items.ts:239` (a consumed inventory unit). So the
   observable events are: an equip flip, an unequip flip, a transfer, and a
   DELETE. The delete matters most: deleting an equipped row removes the item
   the portrait was depicting, and `actor_wardrobe.item_instance_id` is
   `ON DELETE SET NULL` (`src/db/migrations/031_wardrobe.ts:72`), so the
   binding dangles. A reactive trigger MUST therefore cover the delete path as
   well, not just the equip-state flips.

4. **The equip taxonomy is coarse.** `EQUIP_SLOTS` is
   `weapon | armor | accessory` at `src/services/actor-items/equip.ts:13`, and
   `slotForCategory` (`:22-46`) collapses `consumable`, `key_item`,
   `quest_item`, `material`, `tool`, `container`, `treasure`, `book`,
   `artifact`, `misc` and `other` into `"accessory"` (`:32-43`).

5. **The gate seam is live.** `requestOutfitChange` is at
   `src/characters/services/wardrobe/change-gate.ts:71-79`. It has exactly ONE
   production caller today: `src/routes/wardrobe-overrides.ts:100-106`.

6. **The initiator enum and its bypass.** `OutfitChangeInitiator` is declared
   at `src/characters/services/wardrobe/change-gate.ts:16-27`; `npc` and
   `world_rule` bypass the gate unconditionally at `:75-77`. The item-side
   initiator MUST NOT bypass — an unequip is a player-visible action, so it
   goes through the gate like the `player`/`gm` initiators.

7. **The loadout bridge is read-only and flag-gated, default OFF.** The flag
   key `wardrobe_loadout_bridge` and its reader are at
   `src/characters/services/wardrobe/loadout-bridge.ts:26-41`; the equipped
   -> outfit mapping is an inner join over `actor_wardrobe` + `actor_items` at
   `:59-68`. It writes nothing on equip (module header `:18-19`).

8. **The binding write side exists but is route-only.**
   `bindWardrobeItemInstance` is at
   `src/characters/services/wardrobe/bindings.ts:21-62` and is called from
   exactly one place: `src/routes/wardrobe-bindings.ts:61`.

9. **The live render path already ships.** `src/routes/messages/read.ts:79-87`
   calls `attachMessageAvatars`, which runs `resolveOutfit` and then
   `selectAvatar` at `src/characters/services/wardrobe/message-avatar.ts:152-174`.
   The ladder order (chat override > location rule > equipped loadout >
   default) is owned by `src/characters/services/wardrobe/resolve.ts:178-204`
   and the variant rung order by
   `src/characters/services/wardrobe/selection-ladder.ts:9-17`.

**Acceptance Criteria:**

- [ ] AC1: Unequipping a bound garment produces exactly ONE change request, routed through `requestOutfitChange` with a non-bypassing initiator, and a test asserts the injected gate actually SAW the request (the gate is not bypassed the way `npc`/`world_rule` are at `change-gate.ts:75-77`).
- [ ] AC2: Transferring a bound item creates NO outfit change for the receiving actor — the receiving copy arrives `Unequipped` (`transfer.ts:113`) and is therefore not equipped and not bound — and the sender's outfit is not stripped without a request going through the gate. When the transfer empties the sender's stack the sender's row is DELETED (`transfer.ts:74`), which counts as the sender losing the item and MUST produce exactly one request.
- [ ] AC3: After the trigger fires, the next render resolves through the UNCHANGED ladder (chat override > location rule > equipped loadout > default); the trigger never writes a variant or an asset id directly, it only produces a change request.
- [ ] AC4: A message keeps its stored `messages.outfit_id` snapshot (`src/db/schema-core.ts:817`, migration `src/db/migrations/070_messages_outfit_id.ts:12-17`), so a later outfit change does not retroactively repaint an already-rendered message.
- [ ] AC5: Idempotency — the same unequip performed twice yields one request; a repeat against an already-applied state is a no-op with no request and no error.
- [ ] AC6: A failure inside the trigger (gate throw, resolver throw, missing binding) never leaves the item row half-bound and never loses a turn: the equip-state flip stands, the item row stays consistent, and the failure is swallowed and logged.
- [ ] AC7: Existing equip/unequip tests still pass, and a new test asserts the change-gate call count (exactly one per effective unequip, zero per no-op).
- [ ] AC8: Deleting an equipped item row (`transfer.ts:74`, `rpg/crafting/process.ts:149`, `rpg/service/battles/items.ts:239`) produces exactly one change request for that actor — the delete path is covered by the trigger, not only the equip-state flips — and the now-dangling `actor_wardrobe` binding (`ON DELETE SET NULL`, `src/db/migrations/031_wardrobe.ts:72`) is cleaned up or explicitly documented as dangling.

**Notes / Evidence:**

- Equip/unequip transitions: `src/services/actor-items.ts:155-217` (equip write
  `:191-195`, unequip write `:210-214`)
- Transfer inserts the receiving copy unequipped:
  `src/services/actor-items/transfer.ts:99-115` (`equipped` at `:113`); the
  sender's row is decremented at `:76-80` or DELETED at `:73-74`
- The only two `equipped` FLIPS on an existing row:
  `src/services/actor-items.ts:191-195` (equip) and `:210-214` (unequip);
  every other `equipped` write INSERTS a new, unequipped row:
  `src/routes/actor-items.ts:56`, `src/rpg/crafting/process.ts:61`,
  `src/services/actor-items/transfer.ts:113`
- The `actor_items` DELETE sites a trigger must also cover:
  `src/services/actor-items/transfer.ts:74`,
  `src/rpg/crafting/process.ts:149`,
  `src/rpg/service/battles/items.ts:239` (grep pattern:
  `deleteFrom("actor_items"` — the call sites use a trailing comma, so a
  closing-paren pattern misses them)
- Equip slots and the category collapse: `src/services/actor-items/equip.ts:13`,
  `:22-46` (collapse block `:32-43`)
- The gate seam: `src/characters/services/wardrobe/change-gate.ts:71-79`
- The initiator enum: `src/characters/services/wardrobe/change-gate.ts:16-27`;
  the unconditional bypass at `:75-77`
- The single production caller: `src/routes/wardrobe-overrides.ts:100-106`
- The read-only, flag-gated bridge:
  `src/characters/services/wardrobe/loadout-bridge.ts:26-41`, `:59-68`
- The binding write side: `src/characters/services/wardrobe/bindings.ts:21-62`;
  its only caller `src/routes/wardrobe-bindings.ts:61`
- The live render path: `src/routes/messages/read.ts:79-87` ->
  `src/characters/services/wardrobe/message-avatar.ts:152-174`
- Ladder order: `src/characters/services/wardrobe/resolve.ts:178-204`;
  variant rungs `src/characters/services/wardrobe/selection-ladder.ts:9-17`
- The per-message snapshot column: `src/db/schema-core.ts:817`;
  `src/db/migrations/070_messages_outfit_id.ts:12-17`

**Resolved:** 2026-10-23 registry-driven close: git issue 0039f2b (registry tip: 021f1f0c6 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-ITEM-SIDE-OUTFIT-CHANGE-TRI)
