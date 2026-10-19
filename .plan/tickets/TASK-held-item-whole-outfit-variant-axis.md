<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Held item as a whole-outfit variant axis

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-reactive-actor-appearance
**Caveats:** **This ticket answers the reopened layering Non-Goal on the reachable side only.** True item-level compositing remains blocked and is explicitly out of scope — see Context. Security: none. Authorization: the wardrobe item must belong to the actor. Rollback: the tag is free-form text; removing it makes the variants unreachable, nothing more. Stale state: a held-item variant persists after the item is gone — that is the curated-variant model, not a bug, and must be documented. Idempotency: pure. Observability: none. Vocabulary: tags are free-form strings today and **nothing interprets them**, so a closed vocabulary must be established here or the axis silently does nothing.

**Summary:**

Model a held item as a **whole-outfit variant** — a curated `wardrobe_items`
entry like `battle-wielding` or `hands-free` — rather than as item-level
compositing. This is the reachable half of the reopened layering Non-Goal.

**Context:**

**The user's goal:** *"character removes item to inventory → portrait holding
the item is replaced by the default portrait, outfit unchanged."*

**That goal does not need compositing.** It is pure variant selection: an outfit
row that depicts a held item, selected while the item is held; when the item
leaves the inventory, the outfit resolves back to the default. No mask, no
layer, no per-item render.

**What item-level compositing would actually cost — and why it stays blocked.**
The predecessor barred "Item-level appearance compositing (layered garment
rendering) — whole-outfit variants only"
(`epic-wardrobe-avatar-variants.md:127-128`). Reopening that properly means
rendering a garment separately and layering it, which needs:

- **A mask.** Inpaint requires `mask_image` as a `required: true` uploaded
  image, `"White = inpaint area, Black = keep"`
  (`src/image-edit/templates/builtin/inpaint.ts:39-46`). Nothing derives one:
  a repo-wide grep for mask-derivation terms across `src/` returns exactly one
  hit, an unrelated test string (`src/tui/harness/display.test.ts:165`).
- **SAM3.** `.plan/epics/epic-sam3-segmentation-integration.md:8` is
  `Status: Not Started`, its feasibility probe is pending (`:9`), and it lists
  its own ComfyUI prerequisites — numeric parameterization, node-id allocation,
  parameter validation — as still open (`:50-55`).

So the reopened Non-Goal splits cleanly, and **this ticket takes only the ready
half**:

| Capability | Route | Reachable today |
|---|---|---|
| An outfit variant that *depicts* a held item | curated `wardrobe_items` row + tags | **yes** |
| Per-item layered compositing onto a base outfit | mask + SAM3 + inpaint | **no** |

**The data model supports the ready half today.** `WardrobeItem`
(`src/characters/services/wardrobe/types.ts:8-21`) carries `tags: string[]`,
already documented in the predecessor as "e.g. `formal|armor|sleepwear|swim`"
(`epic-wardrobe-avatar-variants.md:61-63`). The tags feed the generation prompt:
`single-generation.ts:43-52` reads `wardrobe_items.descriptor` and injects it as
a prompt slot. **Tags are not read by any code path today** — so this ticket
must either (a) define what interprets them, or (b) keep the information in
`descriptor`, which *is* read. Option (b) is cheaper and is the recommendation.

**What this ticket must not claim.** "held item vs worn" as a data distinction
does not exist and is not introduced here. `EQUIP_SLOTS` is
`weapon | armor | accessory` (`src/services/actor-items/equip.ts:13-15`) and
`slotForCategory` (`equip.ts:22-46`) maps every non-weapon/armor category to
`accessory` — so a potion and a pair of boots share a slot, and
`actor_items` has no `equipped_slot` column. A sword and a tunic are the same
kind of row. This ticket does not fix that; it makes the *appearance*
distinction, not the *data* distinction.

**Acceptance Criteria:**

- [ ] At least two curated whole-outfit variants exist that differ only in
      whether a held item is depicted (e.g. a `hands-free` and a
      `battle-wielding` outfit for the same actor), created through the existing
      wardrobe CRUD — not hand-written rows
- [ ] The distinction is carried in `descriptor`, which
      `single-generation.ts:43-52` already reads, **or** in `tags` plus an
      explicit reader that this ticket adds and tests
- [ ] Selection between the two variants is driven by state (equipped item +
      binding, per `TASK-equip-binds-outfit-write-side.md`) and not by a new
      selection axis
- [ ] With the item unequipped, the default portrait renders — the user's stated
      goal, pinned by a test
- [ ] A documented statement in the ticket's merged epic context that
      per-item compositing is **not** provided and why
- [ ] No new equip slot, no new wardrobe column, no migration
- [ ] Tests pass; `bun run typecheck` and `bun run lint` clean

**Notes / Evidence:**

- The reopened Non-Goal: `epic-wardrobe-avatar-variants.md:127-128`
- Why compositing is blocked: `src/image-edit/templates/builtin/inpaint.ts:39-46`
  (hand-uploaded required mask)
- SAM3 status: `.plan/epics/epic-sam3-segmentation-integration.md:8-9,50-55`
- Wardrobe item shape and its free-form tags:
  `src/characters/services/wardrobe/types.ts:8-21`; tag vocabulary precedent at
  `epic-wardrobe-avatar-variants.md:61-63`
- The descriptor prompt slot that is actually read:
  `src/characters/services/emotion-avatar-service/single-generation.ts:43-52`
- Slot taxonomy (why held-vs-worn is not expressible in data):
  `src/services/actor-items/equip.ts:13-15`, `:22-46`
- The bridge that turns an equipped item into an outfit:
  `src/characters/services/wardrobe/loadout-bridge.ts:55-71`
- Resolution ladder a variant rides:
  `src/characters/services/wardrobe/selection-ladder.ts:9-17`