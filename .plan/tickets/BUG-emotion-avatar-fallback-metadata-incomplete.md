<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Emotion-avatar fallback prompt only sees `alt_text`; never uses character description

**Status:** ✅ Done
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
- The earlier round-1 ticket premise — "stored `generationPrompt` on
  `assets.metadata`" — was incorrect. The data was never captured.
  The corrected follow-up is in the Follow-on section below.

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

- [x] `extractAvatarMetadata(db, assetId, { actorId })` returns
      `caption: <actors.description>` when no alt text is set.
- [x] `extractAvatarMetadata(db, assetId)` (no opts) returns the
      existing shape unchanged (drop-in compat).
- [x] Caller in `generation.ts:160` is updated to pass
      `{ actorId: opts.actorId }`.
- [x] For a character with `description = "Aria, the elven mage"`
      and no alt text, `buildEmotionPrompt` produces
      `"Aria, the elven mage, <emotionModifier>, <qualityTags>"`.
- [x] New unit tests in `emotion-avatar-fallback.test.ts` cover:
      alt text wins over description / description used as caption when
      alt text missing / `character_avatars.tags` surfaced /
      malformed `tags` JSON ignored (no throw) /
      drop-in compat: omitting `actorId` returns unchanged shape.

## Follow-on (separate ticket; do not bundle)

The original spec (`TASK-emotions-avatar-edit-model.md:52-61`) calls
for four metadata sources: `caption` (auto-generated), `tags`
(style/setting), `generationPrompt`, and `EXIF`. Status after
investigation:

- **`caption`**: ALREADY captured at upload time by `createAsset`
  (`src/assets/service/create.ts:100-104`), which calls
  `extractImageMetadata(buffer)` and promotes the PNG `tEXt` / JPEG
  COM / GIF comment into `assets.alt_text`. No additional work needed
  in this file's path. The current fix only reaches this column when
  the caller doesn't pass `actorId` (drop-in compat).
- **`tags`**: Currently NOT captured anywhere. The `character_avatars.tags`
  JSON column exists and is read by `selectAvatar`, but it's set by
  callers (e.g. `generation.ts:223` hardcodes `{ emotion: opts.emotion }`)
  with the avatar's own tag set, not style/setting context. A future
  ticket could persist per-asset style tags alongside the file.
- **`generationPrompt`**: NOT captured. SD pipelines
  (`src/generation/image-engine/*.ts`) don't write the prompt back into
  the PNG `tEXt` chunk. Persisting it would require either (a) modifying
  the SD call sites to encode the prompt into the PNG metadata, or
  (b) adding an `assets.metadata` JSON column and threading the prompt
  through `createAsset`. Both are out of scope here.
- **`EXIF`**: NOT extracted. `extractImageMetadata` only reads `tEXt`
  / JPEG COM / GIF comment — no EXIF parsing. Out of scope here.

The current fix is intentionally narrow: it surfaces
`actors.description` (the right DB-side anchor) and `character_avatars.tags`
(current row data) without introducing new columns or new file-format
dependencies. Wider metadata capture is tracked as a separate ticket
once the spec calls.

## Notes

**Reconciliation (2026-09-02)**: Prerequisite for epic Emotion Avatar Message Binding persist path (regeneration/render work blocked until hook payload carries actor+chat).

## Resolution

Verified against src/ in ticket-closeout-audit: emotion-avatar-fallback.ts:65-110 extractAvatarMetadata with caption+tags.
