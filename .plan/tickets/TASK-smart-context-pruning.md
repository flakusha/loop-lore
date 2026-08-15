# TASK: Smart Context Pruning (FEAT-072)

**Status:** ✅ Done
**Priority:** Medium
**Effort:** Med
**Epic:** Epic 36 (Chat Lifecycle & Moderation)
**Tags:** chat, context, pruning, memory
**Git Issue:** FEAT-072

## Summary

Score-based pruning of chat context to fit token budget. Older, low-importance messages are removed while important content (character moments, lore, decisions) is promoted to long-term memory.

## Rationale

- Context windows are finite — long chats need intelligent pruning
- Not all messages are equal — some contain critical information
- Automatic promotion to memory preserves important content
- Score-based approach is transparent and tunable

## Current State

- Context compaction at 85% threshold (summarize older half)
- No scoring system for message importance
- No promotion to memory during pruning
- No user control over pruning strategy

## Architecture

### Importance Scoring

```typescript
interface MessageScore {
  messageId: string;
  relevanceScore: number; // 0-1, based on keywords, role, recency
  importanceScore: number; // 0-1, based on content type (lore, decision, emotion)
  combinedScore: number; // weighted combination
  shouldPromote: boolean; // if importanceScore > threshold
  shouldPrune: boolean; // if combinedScore < threshold
}
```

### Scoring Factors

| Factor         | Weight | Description                              |
| -------------- | ------ | ---------------------------------------- |
| Recency        | 0.3    | Recent messages score higher             |
| Role           | 0.2    | User/character messages > system         |
| Keywords       | 0.2    | Lore, decision, emotion keywords         |
| Memory links   | 0.15   | Messages linked to existing memories     |
| Attachments    | 0.1    | Messages with images/audio are important |
| User reactions | 0.05   | Messages with reactions/likes            |

### Pruning Strategy

1. Calculate scores for all messages
2. Sort by combinedScore (ascending)
3. Remove lowest-scoring messages until under budget
4. Promote high-importance messages to memory before removal
5. Insert a system message noting what was pruned

## Tasks

- [ ] Implement message scoring algorithm
- [ ] Add pruning strategy configuration (aggressiveness, thresholds)
- [ ] Implement memory promotion for high-importance messages
- [ ] Add pruning notification system message
- [ ] Add UI control for pruning strategy (aggressive/conservative)
- [ ] Write tests for scoring and pruning logic

## Risk

Medium — aggressive pruning can lose important context. Need careful tuning of scoring weights and user controls.

## Files

- `src/chat/pruning.ts` — scoring and pruning logic
- `src/frontend/components/pruning-settings.html` — UI controls
- `src/frontend/alpine/pruning.ts` — frontend state
