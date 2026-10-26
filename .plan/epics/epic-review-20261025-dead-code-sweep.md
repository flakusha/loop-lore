<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Dead-Code & Cutover-Debris Sweep + Gate Blind Spots (2026-10-25 review round E-3)

**Status:** Not Started
**Status Note:** Filed from the 2026-10-25 post-merge review round
**Priority:** Medium
**Effort:** Medium
**Type:** Infrastructure Epic
**Tags:** dead-code, knip, cutover-debris, gates, review-2026-10-25

**Overview:** (see sections below)

## Summary

Knip's dead-code gates pass while whole modules, duplicate helpers, and orphaned HTML partials accumulate — the gates track TS, not HTML partials, and miss orphan modules (review-core.md cluster "Dead-code sweep the gates don't see"; review-surfaces.md S-10/S-11).

## Scope

1. Dead modules/helpers: src/regex/slugs.ts (16 orphan exports, identical-regex twin of HASHED_ASSET_PATTERN, still edited this week) (F-5); parser/task-detect orphans (`parseCharacterFile`, `detectAuxTask`, `GAME_STATE_BLOCK_ALL`/`extractGameStateBlocks`); duplicate `validateCharacter` (parser.ts:200 vs validator/index.ts:42, divergent contracts); triple re-export paths (class-template-resolver.ts:51-54 + class-tag-vocab.ts:22-27); dangling JSDoc over `export { registry }` in plugins/loader.ts:445-447 (F-7).
2. Orphaned HTML partials: src/components/chat/music-embed.html (markup duplicated inline in message-list.html) (S-10); src/views/partials/planning-todo.html (only Go-template-syntax template in the tree, referenced by nothing) (S-11).
3. Gate blind spots: extend the dead-code gates to see HTML partials and orphan modules so this debris class cannot re-accumulate.

## Scope note (dedupe)

15a6ca4 (unreachable view partials + orphan partial + dead CSS) and 4612157 (delete 69 knip files) cover much of the existing debris — dedupe against them when executing; this epic covers what they do not (slugs.ts, parser/task-detect orphans, duplicate validateCharacter, re-export paths, the gate extensions).

## Tickets

- Related: 15a6ca4, 4612157
- Findings: F-5, F-7, S-10, S-11 in .tmp/reviews/2026-10-25/ (review-core.md / review-surfaces.md)

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round).


git issue: ebedbe0
