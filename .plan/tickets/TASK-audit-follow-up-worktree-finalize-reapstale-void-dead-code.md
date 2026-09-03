<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit follow-up: worktree finalize reapStale() void dead code

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

Audit found 7aa33f8b added `void reapStale()` in scripts/worktree/commands/finalize.ts but never captures return or awaits; the surrounding function returns before reap completes. Either await reapStale() or remove the void wrapper. See audit .tmp/audit/batch-B-config-size.md finding MEDIUM.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
