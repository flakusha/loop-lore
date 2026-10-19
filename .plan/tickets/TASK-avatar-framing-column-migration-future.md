<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Framing as a migration column (future — supersedes the JSON tag)

**Status:** Postponed
**Priority:** low
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Caveats:** **Deliberately postponed, not blocked** — this is the user's decision 2 option B, explicitly deferred. Do not implement alongside the JSON tag: the two must never coexist, or the repo grows two conventions for one concept. Promote only when a second consumer needs to **query by framing** in SQL rather than filter in memory. Security: none. Authorization: none. Rollback: the column is additive and nullable; dropping it returns every row to tag-based framing. Stale state: rows written after the column lands but before the tag is retired can disagree; the migration must reconcile in one step, not two. Idempotency: migration is one-way and runs once. Observability: none.

**Summary:**

A real `character_avatars.framing` column with validation, **superseding** the
JSON `AvatarTagType` tag member. Deliberately a future task; the tag ships first.

**Context:**

The user's decision 2 was explicit: option A (a JSON `AvatarTagType` member) now,
because `character_avatars.tags` is already a JSON column
(`src/db/schema-character.ts:94`) and a tag costs **zero migration**; option B (a
real migration column) stays **a future task, not now**.

**Why option A is the right first move.**

- `AvatarTagType` is a *consumed* axis: `ALL_TAG_TYPES`
  (`src/characters/services/avatar-service/selection.ts:15`),
  `DEFAULT_FALLBACK_CHAIN` (`:18`), the scoring loop (`:225-232`), and
  `context[tag]` in `calculateAvatarScore`. A new member becomes live with one
  array edit.
- `tags` is JSON, so no migration, no schema/manifest regeneration, no
  backfill.
- The epoch cost of a column is real: a forward migration (next free is `065` —
  highest present is `src/db/migrations/064_vn_choice_selections.ts`), plus
  `bun run db:sync-types` and `bun run db:sync-manifest`, plus validation
  plumbing.

**Why the column eventually wins.** A tag is **unvalidated free text in a JSON
blob**. It cannot be indexed, cannot carry a foreign-key-like guarantee, cannot
be a join predicate, and cannot be validated by the DB. The moment a second
consumer needs *"all full-body variants for this actor"* as a SQL predicate, the
tag stops being adequate.

**The promotion trigger, stated so this is not an open-ended maybe:** promote
when either (a) a second code path must query by framing in SQL, or (b) the tag
set in production has drifted (a value outside the closed set has been written).

**The migration must be one step, not two.** When it lands it must:
1. add the nullable column;
2. backfill it from `tags.framing` for existing rows;
3. retire the JSON tag in the same change.

Leaving both live creates two sources of truth for one axis — the exact
duplicate-convention failure the predecessor's schema work avoided by making
`outfit_id` a column and not a tag
(`epic-wardrobe-avatar-variants.md:52-54`).

**Acceptance Criteria:**

- [ ] This ticket is promoted only when one of the two stated triggers fires, and
      the trigger is named in the ticket's Status Note at promotion time
- [ ] A forward migration adds `character_avatars.framing`, nullable, with a
      check constraint or equivalent validation over the closed value set
- [ ] The migration backfills `framing` from `tags.framing` for every existing
      row that carries it, in the **same** migration
- [ ] The JSON `AvatarTagType` tag member is removed in the **same** change — the
      two never coexist
- [ ] All readers move to the column, including the scoring loop
      (`src/characters/services/avatar-service/selection.ts:225-232`), the
      fallback chain (`:18`), and the `/outfit-resolve` route
      (`src/routes/wardrobe-avatars.ts:109-159`)
- [ ] `bun run db:sync-types`, `bun run db:sync-manifest`,
      `bun run schemas:check`, `bun run typecheck`, and `bun run lint` pass
- [ ] A test asserts a value outside the closed set is rejected at write time

**Notes / Evidence:**

- The user's decision: option A now, option B as a future task
- Why the tag is free: `character_avatars.tags` is JSON —
  `src/db/schema-character.ts:94`; the table shape at `:88-100`
- The consumed tag axes a column would replace:
  `src/characters/services/avatar-service/selection.ts:15`, `:18`,
  `:167-174` (weights), `:225-232` (scoring loop)
- The route that would carry framing:
  `src/routes/wardrobe-avatars.ts:109-159`
- Precedent for a column over a tag: `character_avatars.outfit_id`
  (`src/db/schema-character.ts:99`), specified at
  `epic-wardrobe-avatar-variants.md:52-54`
- Next free migration number: `065` (highest present is
  `src/db/migrations/064_vn_choice_selections.ts`)
- No framing column or field exists anywhere today:
  `src/db/schema-content.ts:36-59`, `src/db/enums-content.ts:27-33`
- The tag ticket this supersedes: `TASK-avatar-framing-tag-member.md`