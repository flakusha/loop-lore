---
title: "FEAT-055: Lorebook activation conditions"
status: open
priority: medium
labels: [feature, prompt-system, lorebook]
epic: epic-character-core-system
related: [FEAT-065, TASK-wire-memory-injection]
---

# FEAT-055: Lorebook activation conditions

## What

Enhance the existing lore section activation system (`src/assistant/prompt/sections/lore.ts`) with richer activation condition types beyond simple keyword matching.

## Why

The current lore system activates entries when one of their keys appears in the most recent user message. SillyTavern/Chub.world lorebooks support more sophisticated activation: regex patterns, token-proximity scanning, AND/OR key groups, probability-based activation, and conversation-depth triggers. Power users building complex worlds need these to avoid context bloat while ensuring critical lore fires reliably.

## Current State

- `src/assistant/prompt/sections/lore.ts` — keyword matching via `parseKeywords()` + `recentUserWords()`
- `src/db/migrations/017_lorebook_cooldowns.ts` — cooldown_seconds + last_activated columns
- `src/characters/spec/character.ts` — lorebook entry shape (keys, content, position, constant, selective, cooldown)
- Audience scoping: race/profession/location filtering via `isLoreVisibleTo()`

## Acceptance Criteria

- [ ] **Regex activation keys** — entries with `key_type: "regex"` activate when their key pattern matches any part of the recent conversation (not just last user message)
- [ ] **Key groups (AND/OR)** — entries can specify `key_groups: [["wolf", "forest"], ["beast"]]` where inner array = AND (all must match), outer = OR (any group match)
- [ ] **Conversation-depth scan** — optional `scan_depth` field controls how many recent messages to check (default: 1, current behavior; max: 10 for deep lore)
- [ ] **Probability activation** — optional `activation_chance: 0.3` field for stochastic lore injection (useful for ambient world-building)
- [ ] **Priority weighting** — entries with `priority: "high"` are included before low-priority entries when context budget is tight
- [ ] All existing lore tests pass (no regression on constant/selective/cooldown behavior)
- [ ] New conditions covered by unit tests in `src/assistant/prompt/sections/lore.test.ts`

## Implementation Notes

- Extend `LoreRow` interface with optional fields: `key_type`, `key_groups`, `scan_depth`, `activation_chance`, `priority`
- Migration: add columns to `lorebook_entries` table (nullable, backward-compatible)
- `recentUserWords()` → `recentConversationWords(db, chatId, scanDepth)` to support multi-message scanning
- Regex matching: wrap in try/catch, treat invalid patterns as no-match (never crash prompt assembly)
- Priority: sort included entries by priority desc before wrapping in `<lore>` section

## Dependencies

- No external dependencies — extends existing lore system
- Blocked by: nothing
- Blocks: FEAT-066 (lore-consistency checker needs structured activation data)
