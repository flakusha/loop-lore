<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Context Window Monitor (FEAT-069)

**Status:** ✅ Done
**Priority:** Medium
**Effort:** Low–Med
**Epic:** Epic 36 (Chat Lifecycle & Moderation)
**Tags:** chat, context, tokens, ux
**Spec:** docs/frontend/chat/search-and-filter.md
**Git Issue:** FEAT-069

## Summary

Real-time indicator of token usage in the current chat context. Shows how close the conversation is to the model's token limit with color-coded thresholds (green/yellow/red).

## Rationale

- Users need visibility into context window to avoid truncation
- Prevents accidental loss of important conversation history
- Enables proactive context management (prune, summarize, cut)
- Color coding provides at-a-glance status

## Current State

- No token usage indicator in UI
- Context compaction happens automatically at 85% threshold
- Users unaware when context is about to be compacted

## Architecture

### Token Counter

```typescript
interface ContextWindowState {
  currentTokens: number;
  maxTokens: number;
  percentage: number;
  warningThreshold: 0.7;
  criticalThreshold: 0.85;
  status: "ok" | "warning" | "critical";
}
```

### UI Display

- Progress bar in chat header showing token usage
- Color changes: green (0-70%), yellow (70-85%), red (85%+)
- Tooltip showing exact token counts
- Optional: warning toast at 75% threshold

### Threshold Colors

| Percentage | Color    | Meaning                              |
| ---------- | -------- | ------------------------------------ |
| 0–70%      | Green    | Plenty of room                       |
| 70–85%     | Yellow   | Approaching limit                    |
| 85–95%     | Red      | Near limit, compaction triggered     |
| 95%+       | Dark Red | Danger, consider pruning/summarizing |

## Tasks

- [ ] Create token counting utility (walk message history, sum tokens)
- [ ] Add context window state hook in frontend
- [ ] Add progress bar component to chat header
- [ ] Wire thresholds to color updates
- [ ] Add tooltip with exact token counts
- [ ] Add warning toast at 75% threshold
- [ ] Write tests for token counting logic

## Risk

Low — UI-only addition. Token counting accuracy depends on model tokenizer; slight over/under-count acceptable.

## Files

- `src/chat/token-counter.ts` — token counting logic
- `src/frontend/components/context-window-bar.html` — UI component
- `src/frontend/alpine/context-window.ts` — state management
