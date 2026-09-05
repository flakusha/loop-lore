# BUG: Ollama outage hard-fails all generations

**Status:** ✅ Resolved (fixed 2026-09-05)
**Priority:** high
**Effort:** Medium

## Summary

src/assistant/prompt/sections/memories.ts:89 semanticRecall runs with no reachability probe/try-catch -> reachable OLLAMA_BASE_URL (memory/embeddings.ts:47-56,221-242); PromptAssembler.assemble (prompt-assembler.ts:216-225), buildPrompt (generate-route/build-prompt.ts:79-91) unwrapped -> every generation with unpinned memory + a recent message throws when Ollama is down. Fix: probe + graceful degradation (skip recall, keep keyword match).

## Resolution

Fixed in `memorySection.build` (`src/assistant/prompt/sections/memories.ts`): the semantic re-ranking block is wrapped in `try/catch`. On failure (e.g. Ollama/embed provider down) the section logs a structured warning and keeps the keyword-ranked `mutable` order — the token-budget + injection-filter phases still run, so generation proceeds.

Tests: `src/assistant/prompt/sections/memories.test.ts` (isolated gate via `mock.module("../../../memory/embeddings")` forcing `semanticRecall` to throw) asserts `memorySection.build` still returns a non-empty `memory_context` section instead of throwing. `npm_lifecycle_event=test:unit bun test src/assistant/prompt/sections/memories.test.ts`: 3 pass (incl. this + existing isolation guard).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated