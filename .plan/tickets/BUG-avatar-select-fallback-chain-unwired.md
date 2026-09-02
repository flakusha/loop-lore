<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: selectAvatar ignores fallback_chain (config column is dead)

**Status:** ⬜ Not Started
**Priority:** P2
**Epic:** epic-character-core-system
**Labels:** avatar, selection, fallback, dead-code
**Related:** TASK-character-multi-avatar.md, src/characters/services/avatar-service/selection.ts, src/characters/services/avatar-service/config.ts

## Summary

`character_avatar_config.fallback_chain` is read, parsed, and persisted — but
`selectAvatar` never consults it. When the weighted score yields no clear
winner (e.g. a character has only `mood=happy` avatars but the chat mood is
`neutral`), there's no deterministic fallback; the function silently returns
the first scored avatar instead of the user's configured fallback path.

## Context

- `src/characters/services/avatar-service/selection.ts:18-67` — `selectAvatar`
  reads `selectionRule` + `weights` but ignores `defaultConfig.fallbackChain`.
- `config.ts:33` parses `fallback_chain` JSON; `config.ts:71` and
  `config.ts:97` write it; `world-config.ts` mirrors per-world overrides.
  Schema column exists (`schema-manifest.ts:861`,
  `migrations/010_character_systems.ts:156`). The data round-trips through
  upsert and read but never influences a selection decision.
- The docstring on `selectionRule` (TASK-character-multi-avatar §"Avatar
  Selection Algorithm") explicitly defines a fallback chain: when best score
  ≤ 0.5, walk `fallback_chain` rules and apply `use_default | use_nearest |
  use_previous | generate`.
- Current behavior on no-match: `let bestAvatar = avatars[0]; ...` — returns
  the first DB row (after sort_order asc), not the configured fallback.

## Impact

- Per-character and per-world avatar configuration is partially honored: weights
  apply, but the fallback ordering the user set is silently overridden.
- Operators can't trust the configured `fallback_chain` field — it round-trips
  but does nothing observable.
- `TASK-character-multi-avatar.md` is marked "In Progress (services + routes
  done, needs validation)" — this is the validation gap.

## Fix

In `selectAvatar` (selection.ts), after computing `bestScore`/`bestAvatar`:

1. If `bestScore <= 0` (no tag matched at all) OR the score is below a
   threshold (configurable, default `0`/always-fall-back), walk
   `defaultConfig.fallbackChain ?? []` (with `worldConfig?.fallbackChain`
   override) in order.
2. For each tag type in the chain:
   - Find avatars tagged with that tag; pick the one with the highest score
     on that tag alone; return it if found.
3. If the chain is exhausted, fall back to the avatar where
   `isPrimary === true`, else `avatars[0]`.

Implement per-step action types from the original design doc
(`use_default | use_nearest | use_previous | generate`) as a follow-on. The
minimum observable fix is **the chain is consulted**.

## Acceptance Criteria

- [ ] `selectAvatar` consults `defaultConfig.fallbackChain` when weighted
      scoring finds no clear match.
- [ ] World-config `fallbackChain` (when set) overrides default chain.
- [ ] Chain exhausted → primary avatar → first avatar (existing behavior).
- [ ] New unit tests in `avatar-service.test.ts` covering:
      chain consulted when no emotion match exists / world override wins /
      chain exhausted falls back to primary.
- [ ] `bun run check` green.

## Notes

**Reconciliation (2026-09-02)**: Prerequisite for epic Wardrobe selection ladder (TASK-selection-algorithm-v2-outfit-emotion.md) — fix first; ladder tests pin these branches. Matrix: matrix-emotion-avatar-assets.md → Ticket Reconciliation.
