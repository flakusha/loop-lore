# TASK: LLM Thinking Tag Context Prune

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med

## Summary

Prune `<think>...</think>` (and similar chain-of-thought tags) from LLM responses before storing in chat context. Reduces token usage and keeps chat messages focused on useful output.

## Rationale

- LLM reasoning output (chain of thought) is valuable during generation but low-value in chat history
- Storing thinking tags wastes tokens on subsequent requests (context window fill)
- User sees the final answer — thinking is ephemeral process noise
- Reduces DB storage size for chat messages

## Tags to Handle

| Tag                            | Source                       | Notes            |
| ------------------------------ | ---------------------------- | ---------------- |
| `<think>...</think>`           | DeepSeek, some OpenAI models | Most common      |
| `<reasoning>...</reasoning>`   | Some models                  | Alternate format |
| `<reflection>...</reflection>` | Some models                  | Self-correction  |
| `<thought>...</thought>`       | Some models                  | Variant          |

## Design Decisions

### Scope

- **Per-chat setting:** User can toggle per conversation (default: on)
- **Global setting:** User preference in settings panel (default off — opt-in)
- **Precedence:** Per-chat overrides global

### Behavior

- **At generation time:** Thinking tags are NOT pruned — shown to user in `<details>` expand (already implemented)
- **At storage time:** Thinking tags are pruned from message content before DB insert
- **On display:** If pruned, no thinking indicator shown. If not pruned, `<details>` expand works as today

### Pitfall — System Prompt Cache

LLM providers (OpenAI, Anthropic) cache `system` messages for reuse. If we modify the system prompt to include "ignore thinking tags" or similar, it may cause cache misses.

**Mitigation:**

- Do NOT add "ignore thinking" instructions to system prompt
- Prune at storage/display layer, not at prompt level
- Let LLM generate thinking freely — we remove it after

## Tasks

### Phase 1: Schema & Config

- [ ] Add `prune_thinking_tags` boolean to chat settings (per-chat)
- [ ] Add `prune_thinking_tags` boolean to user preferences (global default)
- [ ] Add to config schema with default `false` (opt-in)
- [ ] Migration for new columns

### Phase 2: Pruning Logic

- [ ] Create `src/generation/thinking-pruner.ts` — regex-based tag extraction
- [ ] Support multiple tag formats (<think>, <reasoning>, <reflection>, <thought>)
- [ ] Return pruned content + metadata (was pruned, original length)
- [ ] Unit tests for all tag formats + edge cases:
  - Nested tags
  - Multi-line thinking
  - Mixed content (thinking + regular text)
  - No tags present
  - Empty thinking block

### Phase 3: Integration

- [ ] Wire pruner into message storage pipeline (after generation, before DB insert)
- [ ] Add setting toggle to chat UI (chat settings panel)
- [ ] Add setting toggle to global settings
- [ ] Show thinking in `<details>` only when NOT pruned

### Phase 4: Migration & Backfill

- [ ] Migration: add columns to chats table + user preferences
- [ ] Optional: backfill script to prune existing messages (destructive — user confirmation)

## Files to Create

- `src/generation/thinking-pruner.ts` — pruning logic
- `src/generation/thinking-pruner.test.ts` — unit tests

## Files to Modify

- `src/db/schema-chats.ts` — add `prune_thinking_tags` column
- `src/db/schema-users.ts` — add `prune_thinking_tags` preference
- `src/generation/generate-route.ts` — wire pruner into storage
- `src/views/chat.html` — settings toggle
- `src/views/settings.html` — global preference
- `src/frontend/alpine/chat.ts` — conditional thinking display

## Edge Cases

| Case                             | Behavior                                                |
| -------------------------------- | ------------------------------------------------------- |
| Nested tags                      | Prune outermost, keep inner if any                      |
| Thinking spans multiple messages | Prune per-message                                       |
| User disables pruning mid-chat   | Existing messages unchanged, new messages pruned        |
| API returns thinking in content  | Prune at storage, not at API boundary                   |
| Streaming with thinking          | Show in `<details>` during stream, prune on final store |

## Risk

Medium — affects message storage pipeline. Tests critical. Cache pitfall mitigated by not touching system prompt.
