<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: LLM-enhance for chat and text windows with leveled rewrites

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Chat windows and text windows need an llm-enhance action with selectable levels: from minor grammar/language fixes up to a full rewrite that follows the imposed world/chat/GM style. Frontend chat-management follow-up from chat-turning-bugfix-batch-9. Scope: web UI enhance affordance on inputs, level selector (e.g. fix-language / polish / rewrite-in-style), prompt assembly reusing world + chat + GM style context, non-destructive preview (ties into input versioning rollback). Out of scope: auto-send of enhanced text. Acceptance: each level produces visibly distinct output; full-rewrite level demonstrably follows world/chat/GM style; original text restorable.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
