<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Stable Stored Chat Key (Future)

**Status:** ⬜ Not Started
**Priority:** High (escalated — see BUG-chat-key-history-loss-join-leave)
**Effort:** Medium
**Epic:** epic-encryption-foundation

## Summary

Store chat key in DB instead of deriving via HKDF. Preserves message history across participant joins. Low priority - current HKDF approach works for forward secrecy.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
