<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: vn generate-choices never persists to vn_choices

**Status:** ⬜ Not Started
**Priority:** critical
**Effort:** Medium
**Epic:** epic-chat-lifecycle-moderation

## Summary

POST /api/chats/:id/vn/generate-choices calls generateBranchingChoices (src/routes/vn-generate/choices.ts:33) which returns {choices:[...]} but never inserts into vn_choices; only inserts are legacy src/routes/vn-choices.ts:105, carry-pins.ts:51, tests. GET vn-choices stays empty; advertised path broken end-to-end. Fix: persist in choices.ts (or story-mode) then list/select. Tests: src/routes/vn-generate.test.ts only covers 401 — add list/select coverage.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
