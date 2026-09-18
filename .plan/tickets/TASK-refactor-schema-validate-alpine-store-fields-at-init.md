<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Refactor: schema-validate Alpine store fields at init

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done — validation landed as `assertChatViewShape` (`src/frontend/alpine/store-schema.ts`); required-field assertion replaces silent runtime defaults
**Priority:** medium
**Effort:** Medium

## Summary

Triggered by 7cbcea68 + a4ce15bf (alpine chat-view init crash). Replace runtime defaults with typed schema.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
