<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Emotion-avatar fallback prompt only sees `alt_text`; never uses character description

**Status:** ⬜ Not Started
**Priority:** P2
**Epic:** epic-emotion-avatar-message-binding / epic-character-core-system
**Labels:** emotion-avatar, fallback, character-description
**Related:** TASK-emotions-avatar-edit-model.md, TASK-emotion-avatar-edit-model.md, src/characters/services/emotion-avatar-fallback.ts, src/characters/services/emotion-avatar-service/generation.ts:158-162

## Summary

`extractAvatarMetadata(db, assetId)` only reads `asset.alt_text` /
`width` / `height`. The character description (the canonical "who is this
character" anchor that every other SD prompt builder reads) is never
consulted, so the txt2img fallback prompt degrades to literal
`"character portrait, …"` whenever the user hasn't typed alt text —
defeating the entire fallback path for any character uploaded without
a hand-written alt string.

## Investigation (2026-08-24)

Verified schema before scoping:

- `assets` table (`src/db/schema-content.ts:16-34`): `id, owner_id,
  filename, mime_type, asset_type, size_bytes, storage_path,
  storage_backend, width, height, duration_secs, alt_text, visibility,
  created_at, encryption_tier, encrypted_key_id, content_hash`. **No
  `metadata`, no `caption`, no `tags`, no `generation_prompt` columns.**
- `character_avatars` (`src/db/schema-character.ts:109-119`): has
  `tags` (JSON text, default `{}`), but the value is the avatar's own
  tag set (`{emotion: "happy", mood: "cheerful", …}`), not metadata
  about the underlying image.
- `generationPrompt` keyword: zero occurrences in `src/` outside
  the `AvatarMetadata` interface declaration itself
  (`emotion-avatar-fallback.ts:29`). The SD prompt that drove a
  generation is **not persisted anywhere**.
- The original ticket premise — "stored `generationPrompt` on
  `assets.metadata`" — was incorrect. The data was never captured.
  See "Follow-on" below.

`actors.description` (`src/db/schema-core.ts:143`) is the right anchor
for the fallback path. It's already known to the caller in
`generation.ts:104` (`opts.actorId` is plumbed through).

## Context (code)

`src/characters/services/emotion-avatar-fallback.ts:49-65` — current:

```ts
return {
  caption: asset.alt_text ?? undefined,
  altText: asset.alt_text ?? undefined,
  width: asset.width ?? undefined,
  height: asset.height ?? undefined,
};
```

`buildEmotionPrompt` (line 79-101) reads `metadata.caption`, falls back
to `metadata.altText`, then to literal `"character portrait"`. With no
alt text, every fallback generation drifts away from the character.

`AvatarMetadata` interface (`emotion-avatar-fallback.ts:21-33`) declares
`tags: Record<string, string>` and `generationPrompt?: string` — both
unused by the impl. See "Follow-on" for the deferred parts.

## Impact

- Every emotion avatar generated via the fallback path without alt text
  drifts from the base character. High-cost (time + provider spend) for
  low fidelity.
- Fallback was the explicit mitigation for "edit-model ecosystem
  maturity" (TASK-emotions-avatar-edit-model §"Why Previously Blocked").
  It currently underperforms the rationale it was added for.
- Tests (`emotion-avatar-fallback.test.ts`) cover `buildEmotionPrompt`
  with hand-crafted metadata — they don't exercise the extraction path
  against a real character row.

## Fix

Two coordinated changes:

**1. `extractAvatarMetadata(db, assetId, opts?: { actorId?: string })`**

Add an optional `actorId` parameter. When provided:

- Query `actors.description`, surface as `caption` (precedence:
  `asset.alt_text` → `actors.description` → undefined).
- Query `character_avatars` (if a row exists for `actorId` +
  `assetId`) — surface `tags` JSON.

When `actorId` is omitted (current behavior), preserve the existing
return shape verbatim. This keeps the function a valid drop-in.

**2. `buildEmotionPrompt` (no signature change)**

Resolve `metadata.caption` already populated by step 1 (which now
chains to character description). No change to the priority order in
the prompt builder — it already prefers caption over altText.

## Acceptance Criteria

- [ ] `extractAvatarMetadata(db, assetId, { actorId })` returns
      `caption: <actors.description>` when no alt text is set.
- [ ] `extractAvatarMetadata(db, assetId)` (no opts) returns the
      existing shape unchanged (drop-in compat).
- [ ] Caller in `generation.ts:160` is updated to pass
      `{ actorId: opts.actorId }`.
- [ ] For a character with `description = "Aria, the elven mage"`
      and no alt text, `buildEmotionPrompt` produces
      `"Aria, the elven mage, <emotionModifier>, <qualityTags>"`.
- [ ] New unit tests in `emotion-avatar-fallback.test.ts` cover:
      altText set / altText unset with description /
      description null with no altText / actor row missing.
- [ ] `bun run check` + `bun test src/characters/services/emotion-avatar-fallback.test.ts` green.

## Follow-on (separate ticket; do not bundle)

The original spec (`TASK-emotions-avatar-edit-model.md:52-61`) calls
for `caption` (auto-generated), `tags` (style/setting), `generationPrompt`,
and `EXIF`. None of those have DB storage today. Recommend:

1. Add migration `016_asset_generation_metadata` adding
   `assets.metadata` (JSON text, nullable) — stores
   `{ tags: Record<string, string>, generationPrompt?: string,
   caption?: string, exif?: Record<string, unknown> }`.
2. Update `generateEmotionAvatar` (`generation.ts:200-216`) to pass
   the SD prompt through to `createAsset`.
3. Then `extractAvatarMetadata` reads from the new column.

Tracked as a separate ticket because it touches a migration (gate
`db:schemas:check`) and needs design sign-off on the column shape.