<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: selectionRule branches action_first / context_first / weighted are no-ops

**Status:** ⬜ Not Started
**Priority:** P3
**Epic:** epic-character-core-system
**Labels:** avatar, selection-rule, enum-hygiene
**Related:** TASK-character-multi-avatar.md, src/characters/services/avatar-service/selection.ts, src/db/enums-character/avatar.ts

## Summary

`AvatarSelectionRule` advertises five values
(`emotion_first | mood_first | action_first | context_first | weighted`) but
`calculateAvatarScore` only applies a ×1.5 boost for `emotion_first` and
`mood_first`. The other three are silently equivalent to plain weighted scoring
despite being distinct choices the operator can select.

## Context

- `src/db/enums-character/avatar.ts:23-28` — enum exposes five values.
- `src/characters/services/avatar-service/selection.ts:92-97`:

  ```ts
  if (
    (rule === "emotion_first" && context.emotion && avatar.tags.emotion) ||
    (rule === "mood_first" && context.mood && avatar.tags.mood)
  ) {
    score *= 1.5;
  }
  ```

  Three of the five enum values produce no behavioral change.
- Default selectionRule is `"emotion_first"`
  (`migrations/010_character_systems.ts:154`), so the gap is invisible by
  default.
- The DB column is `text` (not enum-typed at the SQL layer) — operators can
  persist any value from the enum without validation. The TS-level enum is
  the only check, and it accepts all five.

## Impact

- Operator-visible misbehavior: a user selects `action_first` in the UI, gets
  the same ranking as `weighted` or `emotion_first`. The choice is a lie.
- Test surface is small — no tests assert that `action_first` differs from
  `emotion_first`.
- Future maintainers can read the enum, assume each value has semantics, and
  write code against those semantics — only to find three of them are inert.

## Fix

Decide on one of two outcomes:

**Option A (implement the missing branches)** — implement `action_first`,
`context_first`, and `weighted` as distinct scoring rules:

- `action_first`: ×1.5 boost on `avatar.tags.action === context.action`.
- `context_first`: ×1.5 boost on `avatar.tags.location === context.location`
  OR `avatar.tags.time === context.time` (location/time considered together).
- `weighted`: no boost; the default `defaultWeights` (emotion 0.4, mood 0.3,
  action 0.2, location 0.1, time 0.05, outfit 0.05) govern.

**Option B (collapse the enum)** — drop `action_first`, `context_first`,
`weighted` from the enum (DB write is `text` so existing values persist);
treat them as `emotion_first` aliases or throw on invalid values. Update
the migration upsert to validate.

Recommendation: **Option A** (semantics belong in the contract; the spec
already enumerates them). Effort: small.

## Acceptance Criteria

- [ ] All five `AvatarSelectionRule` values produce a different score
      ordering for at least one synthetic test case.
- [ ] Existing `emotion_first` and `mood_first` behavior unchanged (backward
      compatible).
- [ ] New unit tests cover `action_first` and `context_first` boost paths.
- [ ] `bun run check` green.

## Notes

**Reconciliation (2026-09-02)**: Prerequisite for epic Wardrobe selection ladder (TASK-selection-algorithm-v2-outfit-emotion.md) — fix first; ladder tests pin these branches. Matrix: matrix-emotion-avatar-assets.md → Ticket Reconciliation.
