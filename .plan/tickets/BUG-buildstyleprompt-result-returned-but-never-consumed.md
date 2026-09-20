<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: buildStylePrompt result returned but never consumed

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/generation/generation-routes/regenerate.ts:108, src/frontend/alpine/chat-variants.ts:79

**What**: Returns stylePrompt — chat-variants.ts:79 ignores it.

**Fix**: Either consume buildStylePrompt in the request body or stop returning it.

**Source**: FEAT-014 gap audit (.tmp/audit/SYNTHESIS.md)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
