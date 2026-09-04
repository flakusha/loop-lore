<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Migration 076: distinguish explicit-null renderingOverride from absent key

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

**What**: Migration 076's data-migration WHERE clause uses json_extract(gm_config, '$.renderingOverride') IS NULL, which matches both absent keys AND explicit JSON null values. Currently no code writes JSON null for this field (frontend + validation schemas use either absent key or a literal 'text' or 'visual_novel' value), but a future contributor who writes JSON.stringify with renderingOverride: null would be surprised by the migration overwriting their explicit null.\n\n**Why**: Semantic precision. The intent of the migration is 'only stamp the override if no override was set' — that's 'absent key', not 'absent OR null'. Two different states, currently conflated.\n\n**Where**: src/db/migrations/076_drop_chats_visual_novel.ts (the WHERE clause in the UPDATE)\n\n**Suggested fix**: Use json_type to be precise:\nWHERE visual_novel = 1\n  AND (json_extract(gm_config, '$.renderingOverride') IS NULL OR json_type(gm_config, '$.renderingOverride') = 'null')\n\nNote: the current code already promotes explicit JSON null to visual_novel, which is arguably wrong. After fix, explicit JSON null would also be promoted (preserving current behavior). To preserve explicit null instead, change to:\n  AND json_extract(gm_config, '$.renderingOverride') IS NULL\n  AND json_type(gm_config, '$.renderingOverride') IS DISTINCT FROM 'null'\n\nThe first variant is preferred for now since 'no override = visual_novel' is the AC #5 intent.\n\n**Tests**: Add fixture row with gm_config = JSON.stringify({ renderingOverride: null }) and assert migration result.\n\n**Refs**: commit 122f8e61, .plan/backlog/open-vn-settings-bugs.md AC #5

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
