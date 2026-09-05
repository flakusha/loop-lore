<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Ollama outage hard-fails all generations

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/assistant/prompt/sections/memories.ts:89 semanticRecall runs with no reachability probe/try-catch -> reachable OLLAMA_BASE_URL (memory/embeddings.ts:47-56,221-242); PromptAssembler.assemble (prompt-assembler.ts:216-225), buildPrompt (generate-route/build-prompt.ts:79-91) unwrapped -> every generation with unpinned memory + a recent message throws when Ollama is down. Fix: probe + graceful degradation (skip recall, keep keyword match).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
