<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit follow-up: maxRatio silently raised 10x without regression test

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

Audit found a refactor commit raised maxRatio by 10x without an accompanying regression test. Either add coverage or document why the higher ratio is safe. See audit .tmp/audit/batch-C-rbac-refactor.md finding MEDIUM.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
