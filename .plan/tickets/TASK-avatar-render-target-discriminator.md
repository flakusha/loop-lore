<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Avatar render target discriminator

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Caveats:** TOCTOU: none — resolution is read-time over committed rows. Security: none — the discriminator is server-set. Authorization: the variant must belong to the actor being resolved. Parallelism: none. Lock/unlock lifecycle: none. Partial failure: a missing full-body variant degrades to the bust asset, never to an empty frame. Rollback: dropping the tag member reverts to the current single-target behaviour with no migration to undo. Stale state: a variant whose asset was deleted is a ladder miss, not an error. Data races: none. Idempotency: resolution is deterministic and repeatable. Observability: the resolved render target is visible on the resolution result.

**Summary:**

Distinguish the bust portrait from the full-body VN sprite as a variant dimension of the same (outfit, emotion) key, so one wardrobe entry can resolve to a portrait for chat and a full-body asset for VN. Nothing distinguishes the two today: asset_transforms.context='sprite' is a crop of one asset and the sprite stage renders one flat image per character.

**Context:**

Nothing distinguishes a bust portrait from a full-body VN sprite as a **variant
of the same (outfit, emotion) key**:

- `character_avatars` links actor→asset with `label`, JSON `tags` and
  `outfit_id` (`src/db/schema-character.ts:88-100`); the base portrait is the
  single `actors.avatar_asset_id` (`src/db/schema-core.ts:413`).
- `asset_transforms.context` ∈ `default|sprite|gallery` is a transform of ONE
  source asset, not a per-character variant row
  (`src/db/schema-core.ts:252-256`).
- The sprite layer pipeline does not exist: `src/frontend/vn/sprite-stage.ts:187-204`
  builds ONE `<img>` per cast member, `:151-166` assigns a flat integer z-order
  per CHARACTER, and `public/css/vn.css:992-1039` uses `order:` only (dim =
  filter/opacity). Alpha is asset-level matting only — so a cloak-over-tunic
  wardrobe cannot be composited; it must be a whole-outfit variant.

This is the "portrait vs full body (VN)" axis, planned nowhere.

Precedent to follow: the epic's framing discriminator
(`TASK-avatar-framing-tag-member`) is a JSON `AvatarTagType` member — zero
migration, because `character_avatars.tags` is already a JSON column
(`src/db/schema-character.ts:94`). The epic's own rule is **JSON tag first,
authoritative column later** (`TASK-avatar-framing-column-migration-future.md`
is the deliberate follow-up).

Open design choice (record the decision in the epic): a new tag member, a new
column, or a distinct asset-relation row. The epic's precedent argues for the
tag; a column is a duplicate convention and a relation row is a new table for
one axis.

**Acceptance Criteria:**

- [ ] One wardrobe outfit resolves to a bust asset in chat and to a full-body
      asset in VN.
- [ ] The discriminator is recorded on the avatar row (a JSON tag member, per
      the epic's precedent).
- [ ] The selection ladder stays deterministic: a render-target request never
      reorders the rungs, it only filters within the resolved slot.
- [ ] A missing variant for the requested target degrades to the other target,
      never to an empty render.
- [ ] The chosen representation is recorded in
      `epic-reactive-actor-appearance.md`.
- [ ] Tests passing; `bun run typecheck` and `bun run lint` clean.
