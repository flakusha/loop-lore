<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: characters emotion-avatar: sortOrder derived from Object.values() insertion order

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium
**Summary:** (see ## Summary)
**Context:** (see ## Observed / ## Evidence)
**Acceptance Criteria:** (see ## Acceptance Criteria)

## Summary

## Observed

startBatchGeneration computes sortOrder as `Object.values(EmotionType).indexOf(opts.emotion) + 1` (generation.ts:238). EmotionType is a const object literal in src/db/enums-character/avatar.ts:42-61 with 18 entries. The numeric sortOrder is whatever position the emotion has in insertion order. JS engines preserve insertion order for string-keyed objects (V8, JSC, SM all conform), so the current values are deterministic — but they depend on the source-file order of the EmotionType object. Any reorder, refactor (to a `as const` switch / string union), or alphabetical sort in another file silently changes the stored sortOrder for every emotion avatar, breaking tie-breaking order in selectAvatar's fallback chain.

## Expected

sortOrder should be derived from a deterministic ordinal map maintained alongside EmotionType, not from Object.values() index.

## Evidence

- src/characters/services/emotion-avatar-service/generation.ts:238 — `sortOrder: Object.values(EmotionType).indexOf(opts.emotion) + 1`.
- src/db/enums-character/avatar.ts:42-61 — EmotionType object literal with insertion-order semantics.
- reproduction: rearrange EmotionType entries (or alphabetize), or move to a different enum representation. All emotion avatars' sortOrder values shuffle. selectAvatar (avatar-service) sorts by sort_order ASC, so fallback chain ordering changes silently.

## Severity

low

## Fix direction

Define a `const EMOTION_ORDINAL: Record<EmotionType, number> = { Happy: 18, Sad: 17, ... }` (largest ordinal first or whatever the design intent is) and replace `Object.values(EmotionType).indexOf(opts.emotion) + 1` with `EMOTION_ORDINAL[opts.emotion]`. Pin the ordinals with a test.


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
