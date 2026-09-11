<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Context / Memory / Event Propagation with Compression & Injection

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Epic:** epic-chat-product-features

## Summary

Unify context windowing, memory injection, and event propagation under a single coherent contract. Compression (token-budget aware) must drop noise without losing entity grounding, and injected memories + events must respect the active context budget.

## Acceptance Criteria

- [ ] Sliding context window stays within budget even under heavy random-event load
- [ ] Memory injection (`src/memory/injection/select.ts`) returns only entries above the relevance threshold
- [ ] Event injection via `src/chat/random-events.ts` is throttled by the proactive timing policy
- [ ] Context compression (`src/generation/context-compactor.ts`) preserves entity anchors (names, locations, active quests)
- [ ] Backpressure: when the budget overflows, oldest injected events drop first, never core context
- [ ] RAG recall (`src/rag/search/orchestrator.ts`) participates in the injection pipeline
- [ ] Manual "compact now" action summarizes the current context into a single summary turn (LibreChat `compact` turn precedent)
- [ ] Auto-summarize triggers at a configurable budget threshold before hard overflow (SillyTavern Summarize extension precedent); the summary is reviewable and re-computable

## Related Tickets / Epics

- epic-chat-product-features
- epic-context-injection-correctness
- epic-context-injection-templates
- TASK-context-cut-memory-promotion
- TASK-related-memory-event-injection-hooks
- TASK-character-memory-injection
- TASK-smart-context-pruning
- `epic-chat-context-optimization` — auto-summarize / compact-turn precedent research

## Research Inputs

- LibreChat manual compact summarize-only turn (deepwiki danny-avila/LibreChat, 2026-09-11)
- SillyTavern Summarize extension: stored, reviewable chat summaries (docs.sillytavern.app, 2026-09-11)

## Files

- `src/chat/context-window.ts`
- `src/chat/context-stats.ts`
- `src/chat/random-events.ts`
- `src/chat/proactive/timing.ts`
- `src/memory/injection/decide.ts`
- `src/memory/injection/select.ts`
- `src/memory/injection/relevance.ts`
- `src/generation/auto-gen/post-store.ts`
- `src/rag/search/orchestrator.ts`

## Open Questions

- Is the relevance threshold a global constant, per-chat setting, or per-template?
- When both memory and an event compete for budget, which wins?

