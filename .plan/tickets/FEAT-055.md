---
title: "FEAT-055: Lorebook activation conditions"
status: done
priority: medium
labels: [feature, prompt-system, lorebook]
epic: epic-character-core-system
related: [FEAT-065, TASK-wire-memory-injection]
shipped: 2026-08-21
worktree: lorebook-activation
---

<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-055: Lorebook activation conditions

**Status:** ✅ Done (2026-08-21, worktree `lorebook-activation`, based on dev)

## What

Enhance the existing lore section activation system with richer activation
condition types beyond simple keyword matching: regex keys, AND/OR key groups,
configurable conversation-depth scanning, probability-based activation, and
priority weighting.

## Implementation

- **Migration** — `src/db/migrations/050_lorebook_activation.ts` adds the
  optional columns (`key_type`, `key_groups`, `scan_depth`,
  `activation_chance`) to both `actor_lore_entries` and
  `world_lore_entries`. All nullable + backward-compatible.
- **Activation helper** — `src/assistant/prompt/sections/lore-activation.ts`
  exposes pure selective-activation rules: `matchesSelectiveKeys()`,
  `passesActivationChance()`, `clampScanDepth()`, `MAX_SCAN_DEPTH = 10`.
  Invalid regex patterns are caught and treated as no-match (never crash
  prompt assembly).
- **Consumer** — `src/assistant/prompt/sections/lore.ts` reads the new
  columns, scans `scan_depth` recent user messages via
  `recentConversationWords()` (uses `chatId` + `scanDepth`), applies
  `passesActivationChance`, and sorts included entries by `priority` desc
  (`b.priority - a.priority`).
- **Keywords parser** — `src/assistant/prompt/keywords.ts` exports
  `parseKeyGroups()` for AND/OR group detection (inner array = AND, outer
  = OR) alongside the existing `parseKeywords()`.

## Acceptance Criteria

- [x] **Regex activation keys** — `key_type: "regex"` compiles each `keys`
  entry as a regex and tests it against the scanned text. Invalid patterns
  are no-match (try/catch in `compileKeyRegex`).
- [x] **Key groups (AND/OR)** — `key_groups: [["wolf","forest"],["beast"]]`
  activates when any outer group matches (inner = all keywords required).
- [x] **Conversation-depth scan** — `scan_depth` (default 1, max 10) via
  `clampScanDepth()` controls how many recent user messages to scan.
- [x] **Probability activation** — `activation_chance` (0..1) gates
  otherwise-relevant entries stochastically via `passesActivationChance()`.
- [x] **Priority weighting** — included entries sorted by `priority` desc
  (high first) before being wrapped in the `<lore>` section.
- [x] Existing lore tests pass — constant/selective/cooldown/audience
  behavior preserved (`lore.test.ts` describe block "audience-constrained
  world-lore injection" still green).
- [x] New conditions covered by unit tests — `lore.test.ts` describe block
  "activation conditions (FEAT-055)" exercises regex keys, AND/OR groups,
  scan_depth, activation_chance, and priority ordering end-to-end through
  the real `loreSection.build` path (DB-backed, no selective-keys
  override).

## Notes

- The ticket's original wording used `priority: "high"`; the actual schema
  uses a numeric `priority` column (default 100), sorted high→low in
  `lore.ts:190`. The acceptance criterion (priority weighting) is
  functionally met.
- `passesActivationChance()` is a probabilistic step; tests deterministically
  pin `activation_chance: 1` (always inject) and `activation_chance: 0`
  (never inject) to avoid flakes.
- Blocks: FEAT-066 (lore-consistency checker can now read structured
  activation data via the new columns).
