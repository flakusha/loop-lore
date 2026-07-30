# TASK: Chat Lifecycle & Moderation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Epic:** epic-chat-lifecycle-moderation

## Summary

Full chat lifecycle beyond raw message exchange: context management, chat transitions, reconciliation guards, and moderation. From `epic-chat-lifecycle-moderation.md`.

## Scope

### Context Management

- Sliding window context
- Related memories injection
- Event injection

### Chat Transitions

- Location changes
- Context cuts with memory promotion

### Reconciliation Guards

- LLM loop detection
- Hallucination protection

### Moderation

- Content flagging
- NSFW gating
- User management

## Linked Epics

- `epic-chat-lifecycle-moderation.md`
- **Feature spec:** `FEAT-chat-lifecycle-moderation.md`

## Acceptance Criteria

- [ ] Sliding window context management
- [ ] Related memories injection into context
- [ ] Chat transition handling (location changes)
- [ ] Context cuts with memory promotion
- [ ] LLM loop detection and prevention
- [ ] Hallucination protection guards
- [ ] Content flagging and moderation
- [ ] NSFW gating system
- [ ] Unit tests for reconciliation guards
- [ ] Integration tests for chat lifecycle

## Notes

- Reference `epic-chat-lifecycle-moderation.md` for full system design
- See `src/chat/context-window.ts` for sliding window
- See `src/chat/transitions.ts` for transition handling
