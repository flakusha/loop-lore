<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: vn generate-choices never persists to vn_choices

**Status:** ✅ Resolved (already on dev, 2026-09-05)
**Priority:** critical
**Effort:** Medium
**Epic:** epic-chat-lifecycle-moderation

## Summary

POST /api/chats/:id/vn/generate-choices calls generateBranchingChoices (src/routes/vn-generate/choices.ts:33) which returns {choices:[...]} but never inserts into vn_choices; only inserts are legacy src/routes/vn-choices.ts:105, carry-pins.ts:51, tests. GET vn-choices stays empty; advertised path broken end-to-end. Fix: persist in choices.ts (or story-mode) then list/select. Tests: src/routes/vn-generate.test.ts only covers 401 — add list/select coverage.

## Resolution

Already fixed in dev by `9b8c0222` (`fix(vn): persist generated VN choices and fix FE/BE contract`). Verified 2026-09-05 against current `dev` (`9b8c0222`):

- `src/routes/vn-generate/choices.ts:168-193` — after `generateBranchingChoices`, the handler loops `result.choices` and `insertInto("vn_choices")` each choice (column mapping mirrors `src/routes/vn-choices.ts`); `GET /api/chats/:id/vn-choices?sceneIndex=N` can now list generated choices.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
