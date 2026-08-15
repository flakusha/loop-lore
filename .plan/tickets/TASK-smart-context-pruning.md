# TASK: Smart Context Pruning

**Status:** ✅ Done
**Priority:** Medium
**Effort:** Med
**Epic:** Epic 36 (Chat Lifecycle)
**Tags:** chat, context, pruning, memory, llm
**Source:** FEAT-072 (git issue)

## Summary

Intelligent context trimming that preserves important messages when the
context window fills up. Instead of dropping the oldest messages, score
messages by relevance (recency, role, content importance) and prune
low-value ones first. Promote pruned messages to long-term character
memory when they contain significant content.

## Rationale

- Naive FIFO pruning loses important context (key plot points, decisions)
- Users are surprised when "that thing we discussed" vanishes from context
- Promoting pruned content to memory keeps it accessible without bloating context
- Related to FEAT-069 (Context Window Monitor) — shows what will be pruned

## Current State

- No context window management exists (Epic 36 not started)
- Messages loaded by scroll, no token-aware loading
- No message importance scoring
- No promotion-to-memory pipeline
- `actor_memories` table exists (migration 011) but unused for chat promotion

## Architecture

### Pruning Strategy

```
Context window full (>= 95% of max_tokens)
  ↓
Score all messages in context:
  - Recency: newer = higher score
  - Role: system > character > assistant > user (for RPG importance)
  - Content: messages with decisions, names, locations score higher
  - References: messages referenced by later messages score higher
  ↓
Sort by score ascending (lowest = most prunable)
  ↓
Prune lowest-scored messages until context fits (target: 80%)
  ↓
Promote pruned messages with score > threshold to actor_memories
  ↓
Rebuild context: retained messages + injected memories
```

### Message Scoring

```typescript
interface MessageScore {
  message_id: string;
  recency_score: number; // 0-1, linear decay from newest
  role_score: number; // 0-1, role importance weight
  content_score: number; // 0-1, NER/entity density + action verbs
  reference_score: number; // 0-1, how often referenced by later messages
  total_score: number; // weighted sum
}
```

### Promotion Threshold

Messages with `total_score > PROMOTION_THRESHOLD` (default 0.6) are
promoted to `actor_memories` before pruning. This ensures important
context survives in long-term memory even when removed from active window.

### API Changes

```typescript
// Add to message list response
interface MessageListResponse {
  messages: Message[];
  context: {
    total_tokens: number;
    max_tokens: number;
    pruned_count: number;
    promoted_count: number;
  };
}
```

## Tasks

### Phase 1: Message Scoring

- [ ] Create `src/chat/message-scorer.ts` — scoring logic
- [ ] Implement recency scoring (linear decay)
- [ ] Implement role scoring (system > character > assistant > user)
- [ ] Implement content scoring (entity extraction, action verbs)
- [ ] Implement reference scoring (back-reference counting)
- [ ] Unit tests for each scoring component

### Phase 2: Pruning Pipeline

- [ ] Create `src/chat/context-pruner.ts` — pruning orchestration
- [ ] Implement score-based message selection for pruning
- [ ] Implement token-aware pruning (prune until fits budget)
- [ ] Implement memory promotion for high-score pruned messages
- [ ] Wire into `src/turning/turn-manager.ts` (context assembly)

### Phase 3: Memory Integration

- [ ] Create promotion logic: message → actor_memories
- [ ] Add `source` field to actor_memories: "chat_promotion"
- [ ] Add `original_message_id` reference for traceability
- [ ] Deduplication: don't promote if similar memory exists
- [ ] Wire into `src/actor-memories/` service

### Phase 4: Frontend Awareness

- [ ] Add context pruned count to message list response
- [ ] Show "X messages pruned, Y promoted to memory" in chat info
- [ ] Optional: show pruned messages in a "history" panel (read-only)
- [ ] Wire to FEAT-069 (Context Window Monitor) for visual feedback

## Files to Create

- `src/chat/message-scorer.ts` — message importance scoring
- `src/chat/context-pruner.ts` — pruning orchestration + memory promotion

## Files to Modify

- `src/turning/turn-manager.ts` — integrate pruning into context assembly
- `src/routes/messages.ts` — add context info to message list response
- `src/actor-memories/service.ts` — add chat promotion support
- `src/db/migrations/008_chat_features.ts` — extend with pruning settings columns (in-place)
- `src/db/data-migrations/messages/v1_to_v2.ts` — bump data_version for promotion tracking

## Acceptance Criteria

- [ ] Messages scored correctly by all four dimensions
- [ ] Pruning removes lowest-scored messages first
- [ ] High-score pruned messages promoted to actor_memories
- [ ] Context window stays within token budget after pruning
- [ ] Promotion deduplication prevents redundant memories
- [ ] No performance degradation on message list loading
- [ ] All existing message tests pass

## Risk

Med — touches the generation pipeline (turn-manager) which is core to
chat. Pruning logic must not break message ordering or character context.
Test thoroughly with long conversations.
