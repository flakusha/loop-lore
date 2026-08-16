---
title: "FEAT-068: Token budget advisor"
status: open
priority: medium
labels: [feature, prompt-system, frontend]
epic: epic-chat-context-optimization
related: [FEAT-067, FEAT-055, FEAT-059]
---

# FEAT-068: Token budget advisor

## What

Real-time context-window usage meter with per-section breakdown, trim suggestions, and visual budget indicator in the chat UI.

## Why

Users have no visibility into how their context budget is allocated across system prompt, lore, memories, character card, and conversation history. When the context window fills up, messages get trimmed silently. Users need to understand what's consuming tokens to make informed decisions about what to keep/remove.

## Current State

- `src/frontend/alpine/context-window.ts` — displays overall percentage + color-coded status bar
- `src/chat/context-stats.ts` — `computeContextStats()` returns used/max/percentage/threshold
- `src/chat/token-utils.ts` — `estimateTokens()` for character-based estimation
- `src/assistant/prompt-assembler.ts` — assembles sections with budget tracking
- `src/frontend/alpine/memory-panel.ts` — shows `tokensUsed` / `tokenBudget` (1024) for memories

## Acceptance Criteria

- [ ] **Per-section token breakdown** — API response includes token counts per section: system prompt, lore, memories, character card, conversation history, available budget
- [ ] **Budget visualization** — stacked bar chart in chat header showing section allocation (color-coded: system=blue, lore=green, memories=yellow, history=gray, available=white)
- [ ] **Trim suggestions** — when context is >80% full, advisory panel shows which sections are largest and suggests actions ("Lore entries using 2400 tokens — consider pinning fewer entries")
- [ ] **Section cost in memory panel** — memory panel shows per-entry token cost alongside the total budget meter
- [ ] **Model-aware budget** — uses FEAT-067 registry for accurate context window size instead of hardcoded 32000
- [ ] Unit tests for per-section counting and trim suggestion logic

## Implementation Notes

- Extend `ContextStats` interface: `sections: { name: string; tokens: number; pct: number }[]`
- Prompt assembler already tracks section boundaries — expose token counts from `assemblePrompt()` return value
- Trim suggestions: pure function `suggestTrims(stats: ContextStats, options: TrimOptions): TrimSuggestion[]`
- Frontend: Alpine component extends existing `contextWindow` component
- Keep estimation cheap — use `estimateTokens()` (char-based), not actual tokenizer

## Dependencies

- Blocked by: FEAT-067 (model capability registry for accurate context window size)
- Blocks: nothing (self-contained UX improvement)
