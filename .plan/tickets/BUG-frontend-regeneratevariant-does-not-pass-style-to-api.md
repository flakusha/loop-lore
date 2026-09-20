<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: frontend regenerateVariant does not pass style to API

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/frontend/alpine/chat-variants.ts:100-119

**What**: Sends only {chatId, messageId} — add style param + picker.

**Fix**: Add a style parameter (with UI picker) and forward it to the regenerate API.

**Source**: FEAT-014 gap audit (.tmp/audit/SYNTHESIS.md)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
