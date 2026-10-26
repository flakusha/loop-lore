<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Quest and story-state routes discard notification rejections with an empty catch

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-quests-encounters

**Summary:**

Four fire-and-forget notify calls attach a bare .catch(() => {}), so a failed notification write is invisible and a genuine DB outage looks like a successful request.

Evidence read on dev:

- src/routes/quests/handlers.ts:182,188 — void notifyQuestUpdate(...).catch(() => {})
- src/routes/quests/handlers.ts:233 — same shape for notifyGmAction
- src/routes/story-states/handlers.ts:76 and :166 — same

Not covered by TASK-comment-only-catch-blocks-in-src-frontend-are-invisible-to-e: that ticket is explicitly scoped to src/frontend/**/*.ts and lists 'comment-only catch blocks outside src/frontend/' as out of scope.

Source: .tmp/longcat/review-misc-services.md M3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue fa1df82 (registry tip: 964482eed Konstantin Fedotov Close issue)
