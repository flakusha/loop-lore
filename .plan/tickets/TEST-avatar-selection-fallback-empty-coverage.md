<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TEST: Cover selectAvatar scoring paths + empty-actor fallback

**Status:** ⬜ Not Started
**Priority:** P2
**Epic:** epic-character-core-system
**Labels:** test, avatar, selection, fallback, coverage
**Related:** src/characters/services/avatar-service/selection.ts, src/characters/services/avatar-service.test.ts, BUG-avatar-select-fallback-chain-unwired.md, BUG-avatar-select-empty-throws-no-frontend-fallback.md

## Summary

`avatar-service.test.ts` does not cover the scoring branches that the bug
tickets flag: weighted scoring with multiple matching tags, the
`fallback_chain` no-match path, the no-avatars-at-all path, and the
`action_first` / `context_first` / `weighted` rule branches. Add focused
unit tests so the upcoming fixes have a green baseline and a red TDD seam.

## Context

- `src/characters/services/avatar-service/selection.ts`:
  - line 18-67 `selectAvatar`
  - line 73-105 `calculateAvatarScore`
- `src/characters/services/avatar-service.test.ts` — exists, but the visible
  scope (from `glob`) is CRUD-leaning; scoring / fallback coverage is sparse.
- The two open BUGs (`BUG-avatar-select-fallback-chain-unwired.md`,
  `BUG-avatar-select-empty-throws-no-frontend-fallback.md`,
  `BUG-avatar-selection-rule-unimplemented-branches.md`) all live in
  `selection.ts` and all lack test coverage that distinguishes the broken
  state from a fixed state.
- `bun run check` runs `bun test src/`; new tests run in the default suite
  (no `--isolate` required since these tests are pure DB-on-sqlite).

## Scope

Add tests in `avatar-service.test.ts` (or split a `selection.test.ts`) that
cover the pure `calculateAvatarScore` function (no DB needed) and the
`selectAvatar` DB-backed path. Test fixtures should exercise:
- exact emotion match (single tag match wins)
- partial match across multiple tags (weighted)
- `emotion_first` boost applies
- `mood_first` boost applies
- `action_first` / `context_first` / `weighted` produce the same score
  (captures current bug)
- empty `avatars` → throws (captures current bug)
- `fallback_chain` consulted when no match (will fail today; gates the
  BUG fix)
- world-config `selectionRuleOverride` / `weightsOverride` win

## Acceptance Criteria

- [ ] Pure `calculateAvatarScore` tests for each `AvatarSelectionRule`.
- [ ] `selectAvatar` DB test for: empty-actor throws, no-match returns
      first avatar, fallback-chain consulted, world override wins.
- [ ] Tests run under the default suite (no `--isolate`) and pass green.
- [ ] `bun run check` green.

## Notes

**Reconciliation (2026-09-02)**: Prerequisite for epic Wardrobe selection ladder (TASK-selection-algorithm-v2-outfit-emotion.md) — fix first; ladder tests pin these branches. Matrix: matrix-emotion-avatar-assets.md → Ticket Reconciliation.
