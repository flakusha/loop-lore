<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: story-mode chat without gm_config silently skips generation

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

src/generation/auto-gen/story-mode.ts:43-46: gm_config null -> warn+return; triggerAutoGeneration fire-and-forget (reply.ts:81-94) -> user message persisted, no reply, no error. Reachable: chats.test.ts:528 creates {mode:'story'} only. Fix: surface error via maybeAutoReply or auto-create default GM config.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
