<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN: emotion mood and action driven sprite staging

**Status:** ⬜ Not Started
**Priority:** high
**Epic:** Emotion Avatar Message Binding; Visual Novel Mode
**Effort:** Medium

## Summary

Drive sprite swaps, positions, and highlight from message content: emotion binding selects the sprite variant from the roster; extracted mood/actions (regex extraction pipeline + aux pipeline) trigger staging directives (enter/exit stage, position change, expression swap). Wire extraction outputs to scene-renderer state machine; graceful no-op when no variant exists (fallback to base sprite). Links epic-emotion-avatar-message-binding per-message emotion sprites as the layer content. Acceptance: directive schema, state-machine transition tests, fallback behavior, no sprite flash on rapid messages.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
