<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: resolveResponseLength wired but generation maxTokens not bound

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

AssembledPrompt.responseLength is now resolved (via resolveResponseLength wired into PromptAssembler.assemble) and returned on the prompt result, but the generation layer (chat-reply callsite) still reads the hardcoded/default maxTokens rather than resolvedResponseLength.maxTokens. Close the end-to-end length binding: generation callsite must consume AssembledPrompt.responseLength.maxTokens as the LLM maxTokens (or fallback to the model's context-limit default). Part of epic-chat-context-optimization. Blocking: see epic, gated on generation path refactor.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
