# TASK: Chat Lifecycle & Moderation

**Status:** ✅ Done
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

## Implementation Status

| Component | Status | Evidence |
|-----------|--------|----------|
| Sliding window context | ✅ Done | `src/chat/context-window.ts` — `computeContextWindow` |
| Memory injection | ✅ Done | `src/chat/context-window.ts` — `injectMemories` |
| Event injection | ✅ Done | `src/chat/context-window.ts` — `injectEvents` |
| Context stats in API | ✅ Done | `src/chat/context-window.ts` — `computeContextStats`, wired in `routes/messages/create.ts` |
| Chat transitions | ✅ Done | `src/chat/transitions.ts`, `src/chat/service/transitions.ts` |
| Location changes | ✅ Done | `src/chat/service/location-events.ts` (migration 040) |
| Memory promotion | ✅ Done | `src/chat/pruning/` — `pruneMessages`, `scoreMessage` |
| Random events | ✅ Done | `src/chat/random-events.ts` — `generateRandomEvent`, `randomEventToEventRef` |
| Hallucination guard | ✅ Done | `src/chat/hallucination-guard/` — `detectHallucinations` |
| Content moderation | ✅ Done | `src/chat/moderation.ts` — `checkModerationPermission`, `createModerationAction` |
| NSFW gating | ✅ Done | `src/nsfw/` module |
| Loop detection | 🔲 Stub | Regex pipeline exists in `src/regex/` — needs wiring |
| Pruning in generation pipeline | ✅ Done | `src/generation/auto-gen/context-pruning.ts` — `checkAndPruneContext` called before prompt assembly |

## Acceptance Criteria

- [x] Sliding window context management
- [x] Related memories injection into context
- [x] Chat transition handling (location changes)
- [x] Context cuts with memory promotion
- [ ] LLM loop detection and prevention
- [x] Hallucination protection guards
- [x] Content flagging and moderation
- [x] NSFW gating system
- [x] Unit tests for reconciliation guards
- [x] Integration tests for chat lifecycle

## Notes

- Reference `epic-chat-lifecycle-moderation.md` for full system design
- See `src/chat/context-window.ts` for sliding window
- See `src/chat/transitions.ts` for transition handling
- Pruning pipeline wired into generation flow via `checkAndPruneContext`
- Random events wired into post-store step via `generateRandomEvent`
- Frontend context monitor in chat header (Alpine.js `contextWindow()` component)
