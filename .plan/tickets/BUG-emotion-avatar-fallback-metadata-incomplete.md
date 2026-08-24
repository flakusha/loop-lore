<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Emotion-avatar fallback prompt ignores asset generation metadata

**Status:** ⬜ Not Started
**Priority:** P2
**Epic:** epic-emotion-avatar-message-binding / epic-character-core-system
**Labels:** emotion-avatar, fallback, metadata, generation
**Related:** TASK-emotions-avatar-edit-model.md, TASK-emotion-avatar-edit-model.md, src/characters/services/emotion-avatar-fallback.ts

## Summary

`extractAvatarMetadata()` only reads `asset.alt_text`, `width`, and `height`. The
caption, tags, and original generation prompt that the edit-model-fallback design
calls for are never pulled, so the txt2img fallback prompt degrades to
`"character portrait, …"` whenever the user hasn't typed alt text — defeating the
whole point of the metadata-fallback path.

## Context

- `src/characters/services/emotion-avatar-fallback.ts:49-65` — current impl:

  ```ts
  return {
    caption: asset.alt_text ?? undefined,
    altText: asset.alt_text ?? undefined,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
  };
  ```

- `AvatarMetadata` interface (lines 21-33) declares `tags: Record<string, string>`,
  `generationPrompt?: string` — both unused by the impl.
- `TASK-emotions-avatar-edit-model.md:52-61` lists the metadata source table:
  - Image caption (auto-generated)  → Scene/character description
  - User-provided alt text           → Character identity
  - Asset tags                       → Style/setting context
  - Generation prompt (if generated) → Full original prompt
  - EXIF/metadata                    → Technical details

  Only alt text is wired; the other four sources are dead.
- `buildEmotionPrompt(metadata, emotion, modifier)` reads `metadata.caption` and
  `metadata.altText` only. If both are empty, falls back to literal
  `"character portrait"` — generation drift away from the base character.
- The SD generation pipeline already stores the originating prompt and tags on
  `assets.metadata` (JSON blob) and `assets.alt_text`. The data is in DB; the
  reader just doesn't reach for it.

## Impact

- Every emotion avatar generated via the fallback path drifts from the base
  character (no caption reuse). High-cost (time + provider spend) for low fidelity.
- The fallback was the explicit mitigation for "edit model ecosystem maturity"
  (TASK-emotions-avatar-edit-model §"Why Previously Blocked"). It currently
  underperforms the rationale it was added for.
- Tests (`emotion-avatar-fallback.test.ts`) cover `buildEmotionPrompt` with
  hand-crafted metadata — they don't exercise the extraction path with a real
  asset row, so the regression hides in plain sight.

## Fix

Extend `extractAvatarMetadata(db, assetId)` to:

1. Read `assets.metadata` (JSON text) — emit `tags` (merged into top-level
   `tags`) and `generationPrompt` (key `prompt` / `generation_prompt`,
   whichever exists) when present.
2. Read `assets.caption` if the column exists (audit schema-character.ts);
   otherwise surface as the `caption` field when present.
3. Preserve current `alt_text` / `width` / `height` mapping.
4. Decode the `metadata` JSON defensively (`jsonParseOr(metadata, {})`) — never
   throw on malformed rows.

Also extend `buildEmotionPrompt` to honor `metadata.generationPrompt`:

- When present, prefer `[generationPrompt] + [emotionModifier] + [qualityTags]`.
- Else fall back to the existing `caption → altText → "character portrait"`
  chain.

## Acceptance Criteria

- [ ] `extractAvatarMetadata` returns `tags` and `generationPrompt` from a
      real `assets.metadata` row containing those keys.
- [ ] `extractAvatarMetadata` returns `{}` for an asset without metadata
      (no throw).
- [ ] `buildEmotionPrompt` prepends `generationPrompt` when present, before
      any caption fallback.
- [ ] New unit tests in `emotion-avatar-fallback.test.ts` cover:
      generationPrompt present / caption present / both empty / malformed JSON.
- [ ] `bun run check` green.