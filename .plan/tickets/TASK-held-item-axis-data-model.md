<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Held-item axis data model (a held slot and a category-to-slot taxonomy)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Tags:** outfit
**Caveats:** TOCTOU: a slot or category can change between the read that decides an outfit and the write that persists it — the write re-validates the slot and refuses a stale one. Security: none new; the model change adds no endpoint. Authorization: an item's slot is derived from its own category, never accepted from a caller. Parallelism: two actors equipping items in the same slot concurrently must not silently overwrite each other — the existing slot-conflict check must keep holding under the widened taxonomy. Lock/unlock lifecycle: none. Partial failure: a migration that fails halfway must leave the schema usable — SQLite ALTER TABLE is one column per statement, so each step is independently recoverable. Rollback: the migration's `down` restores the previous slot values; a revert of the taxonomy reverts to the accessory collapse. Stale state: rows written under the old taxonomy keep working — a legacy category maps to a defined slot, never to null. Data races: none — the taxonomy is a pure function of the category. Idempotency: mapping is pure and total over the known categories; an unknown category is rejected at the boundary rather than bucketed. Observability: log a rejected unknown category with the offending value so the vocabulary gap is visible.

**Summary:**

There is no HELD concept in the data model. The epic's existing
`TASK-held-item-whole-outfit-variant-axis` answers "how does an outfit depict a
held item" (curated `wardrobe_items.tags`); this ticket answers the upstream
question "how does the system know the actor is holding something at all", and
fixes the equip taxonomy that currently makes a torch, a book and a ring
indistinguishable.

**Context:**

1. **There is no HELD concept.** `EQUIP_SLOTS` is
   `weapon | armor | accessory` at `src/services/actor-items/equip.ts:13`, and
   `slotForCategory` (`:22-46`) maps every other category — `consumable`,
   `key_item`, `quest_item`, `material`, `tool`, `container`, `treasure`,
   `book`, `artifact`, `misc`, `other` — into `"accessory"` (`:32-43`).
   `ItemCategory` itself is declared at
   `src/db/enums-story/items.ts:7` and has no held member.

2. **"Carrying" today only means an `actor_items` row exists.** "Worn as part
   of an outfit" means the instance is bound through `actor_wardrobe` AND
   equipped — and those two conditions are combined in exactly ONE place, the
   read-only loadout bridge: `src/characters/services/wardrobe/loadout-bridge.ts:59-68`.

3. **The bridge is off by default.** The `system_config` key
   `wardrobe_loadout_bridge` and its reader are at
   `src/characters/services/wardrobe/loadout-bridge.ts:26-41`; anything other
   than the exact string `"true"` keeps the rung OFF.

4. **A deleted instance leaves a dangling binding — and instances ARE
   deleted.** `actor_wardrobe.item_instance_id` is nullable with
   `ON DELETE SET NULL` at `src/db/migrations/031_wardrobe.ts:72`. Three
   production sites delete an `actor_items` row: `src/services/actor-items/transfer.ts:74`,
   `src/rpg/crafting/process.ts:149`, and
   `src/rpg/service/battles/items.ts:239`. The bridge's inner join at
   `src/characters/services/wardrobe/loadout-bridge.ts:61` silently ignores the
   resulting dangling row — the binding stays, contributing nothing.

5. **A descriptor-only outfit is legal.** The migration comment at
   `src/db/migrations/031_wardrobe.ts:60-62` states an outfit with no bound
   instances still exists as a `wardrobe_items` row; the table itself is created
   at `:32-46` with a free-form `tags` column (`:38`).

6. **No layered compositing exists.** The VN stage renders ONE flat `<img>` per
   cast member — `buildStageElement` at `src/frontend/vn/sprite-stage.ts:187-204`
   creates a single portrait element with one image
   (`src/frontend/vn/portrait-manager.ts:79-86`). Ordering is a flat integer
   z-index per character (`assignStageSlots`,
   `src/frontend/vn/sprite-stage.ts:151-166`) plus CSS `order` only
   (`src/public/css/vn.css:992-1016`). Asset-level alpha is matting only
   (`assets.alpha_status`, `src/db/schema-content.ts:54`; the matting job entry
   point at `src/generation/matting/service.ts:66-75`). A held item must therefore be a
   whole-outfit variant, never a layer.

7. **Migration convention if a migration is needed.** Append-only, and the next
   free number is **071** (highest present is
   `src/db/migrations/070_messages_outfit_id.ts`); one ADD COLUMN per alterTable
   statement, per `src/db/migrations/README.md` (append-only policy at `:7-22`,
   structure rules at `:40-43`).

**Acceptance Criteria:**

- [ ] AC1: A held item is representable as data with an EXPLICIT slot (a new `held` equip slot) **or** an explicitly documented reuse of an existing slot — the ticket's implementation states which one it chose and why, and the choice is visible in the code, not implied.
- [ ] AC2: The category->slot taxonomy no longer collapses unrelated categories into `"accessory"`: every `ItemCategory` has an explicit mapping, and an UNKNOWN category is rejected at the boundary (a thrown/typed error) rather than silently bucketed into a slot.
- [ ] AC3: The dangling-binding behavior after item deletion is SPECIFIED — either the binding is cleared explicitly or the outfit is marked incomplete — instead of the bridge's inner join silently ignoring it (`loadout-bridge.ts:61`); the chosen behavior is documented and pinned by a test.
- [ ] AC4: The model supports the epic's curated whole-outfit axis: a held item is expressible as a `wardrobe_items.tags` value that the variant selector consumes (`src/db/migrations/031_wardrobe.ts:38` for the column; `src/characters/services/wardrobe/types.ts:8-21` for the shape).
- [ ] AC5: Any migration is append-only at `071`, follows `src/db/migrations/README.md` (one ADD COLUMN per alterTable statement), and ships with its `up`/`down` pair.
- [ ] AC6: No layered compositing is introduced: the VN stage still renders one flat `<img>` per cast member (`src/frontend/vn/sprite-stage.ts:187-204`) and no per-item layer or occlusion ordering is added.
- [ ] AC7: Unit tests pin the category->slot mapping for EVERY category in `ItemCategory`, plus the rejection of an unknown category.
- [ ] AC8: The wardrobe ladder's rung order is unchanged by this ticket — chat override > location rule > equipped loadout > default (`src/characters/services/wardrobe/resolve.ts:178-204`).

**Notes / Evidence:**

- No HELD concept: `src/services/actor-items/equip.ts:13`, `:22-46` (collapse
  block `:32-43`); `ItemCategory` at `src/db/enums-story/items.ts:7`
- The one place equipped AND bound are combined:
  `src/characters/services/wardrobe/loadout-bridge.ts:59-68`
- The flag, default off: `src/characters/services/wardrobe/loadout-bridge.ts:26-41`
- Nullable instance with ON DELETE SET NULL:
  `src/db/migrations/031_wardrobe.ts:72`; the bridge's inner join at
  `src/characters/services/wardrobe/loadout-bridge.ts:61`; the `actor_items`
  DELETE sites that create the dangling row:
  `src/services/actor-items/transfer.ts:74`,
  `src/rpg/crafting/process.ts:149`,
  `src/rpg/service/battles/items.ts:239`
- Descriptor-only outfit: `src/db/migrations/031_wardrobe.ts:60-62`; the table
  and its `tags` column at `:32-46` (tags at `:38`)
- One flat `<img>` per cast member:
  `src/frontend/vn/sprite-stage.ts:187-204`; the single image at
  `src/frontend/vn/portrait-manager.ts:79-86`
- Flat integer z-order: `src/frontend/vn/sprite-stage.ts:151-166`; CSS order
  only: `src/public/css/vn.css:992-1016`
- Asset alpha is matting only: `src/db/schema-content.ts:54`;
  `src/generation/matting/service.ts:66-75`
- Migration convention: `src/db/migrations/README.md:7-22`, `:40-43`; highest
  present migration `src/db/migrations/070_messages_outfit_id.ts`
- The wardrobe rung order that must not change:
  `src/characters/services/wardrobe/resolve.ts:178-204`
- The companion epic ticket that consumes the axis:
  `TASK-held-item-whole-outfit-variant-axis.md`
