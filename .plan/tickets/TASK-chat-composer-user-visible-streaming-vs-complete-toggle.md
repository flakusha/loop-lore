<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat composer: user-visible streaming vs complete toggle

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-product-features.md

## Summary

Backend exposes both paths (src/generation provider complete + stream; tests exercise streaming:false vs true) but composer has no UX choice; epic-generation-flow-control covers pause/throttle/concurrency, not stream mode. Sources: chat-generations.ts connectGenerationSSE/cancelGeneration, chat-variants.ts continueMessage/retryFromPoint. Acceptance: per-chat (persisted) + per-message toggle; non-streaming path renders on done; stop button aborts either path.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
