---
title: "FEAT-066: Lore-consistency checker"
status: open
priority: medium
labels: [feature, generation, quality]
epic: epic-character-core-system
related: [FEAT-055, FEAT-059, FEAT-062]
---

# FEAT-066: Lore-consistency checker

## What

An AI-powered validation tool that checks character descriptions, world lore, and memory entries for internal contradictions and inconsistencies.

## Why

As users build complex worlds with many lore entries, character traits, and memories, contradictions creep in — a character described as "fearful of water" in one entry but "loves swimming" in another. Manual review is tedious. An automated checker catches these before they confuse the LLM and degrade story quality.

## Current State

- `src/assistant/prompt/sections/lore.ts` — lore entries assembled into prompt
- `src/characters/spec/character.ts` — character card with personality, scenario, etc.
- `src/memory/` — memory system with cross-chat memories
- No consistency validation exists

## Acceptance Criteria

- [ ] **Contradiction detection** — LLM-based analysis comparing lore entries against each other and against character traits, flagging direct contradictions
- [ ] **Staleness detection** — flag lore entries that reference entities/events not mentioned in recent conversation (potentially outdated)
- [ ] **Character-trait alignment** — check if character personality/traits match their behavior in recent messages
- [ ] **`/api/chats/:id/consistency-check`** — on-demand endpoint returning list of flagged issues with severity (contradiction/stale/mismatch) and suggested resolution
- [ ] **Report UI** — sidebar panel showing consistency issues with accept/dismiss actions
- [ ] **Lore deduplication** — flag near-duplicate entries (fuzzy string matching, not LLM)
- [ ] Unit tests for dedup logic and report formatting

## Implementation Notes

- Reuse existing LLM pipeline — send lore + character traits to LLM with classification prompt
- Prompt: "Given these lore entries and character traits, identify contradictions. Reply with JSON array of {entry_ids, issue, severity, suggestion}"
- Dedup: use existing `estimateTokens`-style string similarity (Levenshtein or trigram) — no external deps
- Rate-limit: cache results per chat, refresh on lore/character edit
- UI: Alpine component in chat sidebar, tabbed by severity
- Size gate: consistency checker <250L

## Dependencies

- Blocked by: nothing
- Blocks: nothing (standalone quality tool)
