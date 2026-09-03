<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit follow-up: secondary chat ownership check in reuniteChats untested

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

Audit found src/chat/service/ownership.ts reuniteChats() has a secondary ownership guard branch with no regression test. See audit .tmp/audit/batch-C-rbac-refactor.md finding MEDIUM.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
