<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Framing discriminator as an `AvatarTagType` member

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-reactive-actor-appearance
**Caveats:** The tag is unvalidated free text in JSON — a typo silently makes a variant unroutable. Mitigate with a parse-time closed-set check, not with a column. No migration, so no backfill and no rollback hazard: removing the member makes the variants unroutable, nothing more. Security: none. Authorization: none. Stale state: a variant whose framing value is later renamed becomes unroutable — document the allowed values. Idempotency: pure. Observability: log unroutable framing values once per actor, not per render.

**Summary:**

Add a `Framing` member to `AvatarTagType` (the user's decision 2, option A) so
"the avatar" and "the full-body VN portrait" become independently addressable
assets. **Zero migration** — `character_avatars.tags` is already a JSON column.

**Context:**

**There is no framing discriminator anywhere today.** Verified:

- `assets` (`src/db/schema-content.ts:36-59`) carries only
  `width: number | null` (`:46`) and `height: number | null` (`:47`) as
  intrinsic image data. No `aspect_ratio`, no `framing`, no `render_kind`.
- `AssetType` (`src/db/enums-content.ts:27-33`) is
  `image | audio | video | memory | other` — one image kind, no sub-kind.
- `character_avatars` (`src/db/schema-character.ts:88-100`) carries
  `tags: Generated<string>` (`:94`) and `outfit_id` (`:99`). No framing column,
  and no pointer to an `asset_transforms` context row.
- `TransformContext` (`src/db/enums-content.ts:53-62`) has `sprite` and
  `avatar_circle`, but those are **render contexts**, not subject-framing
  classes, and nothing enforces them as such.

Consequence: one `character_avatars` row is one asset, shared by the chat bubble
(`/thumb` in `src/components/chat/message-list.html:116-124`) and the VN
sprite. **The user cannot currently express "swap the full-body VN portrait but
keep the avatar".**

**Why a tag and not a column (decision 2):** `AvatarTagType` is already a
consumed axis. `ALL_TAG_TYPES` (`selection.ts:15`) enumerates every member,
`DEFAULT_FALLBACK_CHAIN` (`selection.ts:18`) orders them, and
`calculateAvatarScore` (`selection.ts:225-232`) iterates `ALL_TAG_TYPES`
matching context against tag value. Adding a member wires it into scoring with
one array edit — and `tags` being JSON means **no migration at all**.

**The honest caveat:** a tag is unvalidated free text, so framing is
non-authoritative. That is the accepted trade for shipping the axis now. The
authoritative migration column is a separate future task
(`TASK-avatar-framing-column-migration-future.md`) that **supersedes** this one.
Building both is the duplicate-convention failure mode.

**Framing-conditioned generation is not in this ticket.** A framing axis without
an identity lock makes every framing a different person. Generation-side framing
depends on `TASK-img2img-init-image-plumbing.md`.

**Acceptance Criteria:**

- [ ] `AvatarTagType` gains a `Framing` member with a closed value set
      (`bust`, `full_body`, and any others the selection contract needs),
      declared at `src/db/enums-character/avatar.ts:5-12`
- [ ] The member appears in `ALL_TAG_TYPES`
      (`src/characters/services/avatar-service/selection.ts:15`) so scoring picks
      it up, and in `DEFAULT_FALLBACK_CHAIN` (`selection.ts:18`) in a
      documented position
- [ ] `AvatarSelectionContext` (`src/characters/services/avatar-service/types.ts:53-66`)
      gains a `framing` input, and `selectAvatar`'s callers can supply it
- [ ] A parse-time check rejects a `framing` tag value outside the closed set,
      so a typo fails loudly at write time rather than silently at render time
- [ ] `POST /api/actors/:actorId/outfit-resolve`
      (`src/routes/wardrobe-avatars.ts:109-159`) accepts and forwards a framing
      context value
- [ ] Unit tests cover: exact framing match, framing miss falling through to the
      next ladder rung, an out-of-set value rejected, and a null framing
      rendering exactly as today
- [ ] **No migration file is added or edited**
- [ ] `bun run typecheck`, `bun run typecheck:frontend`, and `bun run lint` clean

**Notes / Evidence:**

- No discriminator exists: `src/db/schema-content.ts:36-59` (esp. `:46-47`),
  `src/db/enums-content.ts:27-33`
- `character_avatars` shape: `src/db/schema-character.ts:88-100`; `tags` at
  `:94`
- `TransformContext` is a render context, not a framing class:
  `src/db/enums-content.ts:53-62`
- The consumed tag axes: `src/db/enums-character/avatar.ts:5-12`
- Consumers that make a new member live:
  `src/characters/services/avatar-service/selection.ts:15` (`ALL_TAG_TYPES`),
  `:18` (`DEFAULT_FALLBACK_CHAIN`), `:167-174` (default weights — a `framing`
  weight must be added here or scoring sees `undefined`),
  `:225-232` (`calculateAvatarScore` tag loop)
- Context shape: `src/characters/services/avatar-service/types.ts:53-66`
- Weight config mirror: `src/characters/services/avatar-service/config.ts:96-100`
- The chat bubble that shares the asset:
  `src/components/chat/message-list.html:116-124`
- The VN portrait path that a second framing would target:
  `src/frontend/vn/scene-renderer/render-scene.ts:59-72`
- Zero-migration precedent: `character_avatars.outfit_id` shipped without a
  discriminator redesign (`epic-wardrobe-avatar-variants.md:52-54`)