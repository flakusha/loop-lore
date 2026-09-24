<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Lore/persona/traits placed as system messages (semantic injection)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** high
**Effort:** Medium

## Summary

src/assistant/prompt/sections/lore.ts:246, character-traits.ts:40, user-persona.ts:60,92 place untrusted content as system messages; escapeXml only blocks tag breakout, not instruction injection. Fix: semantic sandbox with explicit data-only markers or user role; add canary. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
