<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Migration 076: harden against malformed gm_config JSON

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

**What**: Migration 076's data-migration UPDATE uses json_set(COALESCE(gm_config, '{}'), '$.renderingOverride', 'visual_novel') which silently NULLocts gm_config if a row contains non-JSON text (SQLite json_set returns NULL on non-JSON input). App contract currently prevents this (all writes go through jsonStringifyOr which falls back to '{}' on failure), but the migration itself is not defensive.\n\n**Why**: Defense-in-depth. Future code paths, manual DB edits, or data imports could produce malformed gm_config. The current migration would silently destroy that row's gm_config instead of skipping it or surfacing an error.\n\n**Where**: src/db/migrations/076_drop_chats_visual_novel.ts\n\n**Suggested fix**: Add a json_valid precondition to the WHERE clause:\n\nOr skip-and-log the malformed rows so an operator can investigate.\n\n**Tests**: Add fixture row with gm_config = 'not-json' (or '' or any invalid JSON) and assert the migration leaves it untouched.\n\n**Learned**: Recorded as nit N-1 in the strict self-review of commit 122f8e61. App contract held at write time, but migrations should be self-defending because the DB has a longer lifespan than the app code that wrote it.\n\n**Refs**: commit 122f8e61, .plan/backlog/open-vn-settings-bugs.md AC #5

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
