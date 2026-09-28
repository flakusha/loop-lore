<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: giwt sync --fix writes an out-of-vocabulary status

**Summary:** 'giwt sync --fix' sets a closed ticket's status to lowercase 'done', which is outside the status vocabulary, so the file it just wrote fails the 'status-vocab' gate on the very next run.
**Context:** Hit while resyncing a ticket status that a sibling worktree had closed on the shared issue tracker. The same command also leaves .plan/feature-matrix.md stale, failing the 'matrix' gate. The manual recovery was: write 'Done' by hand, then regenerate the matrix.
**Acceptance Criteria:** The closed state maps onto the canonical 'Done' rather than 'done', and the feature matrix is regenerated as part of the fix pass so one command leaves plan state consistent.
**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

'giwt sync --fix' sets a closed ticket's status to lowercase 'done'. The status vocabulary is Not Started, In Progress, Blocked, Done, Wontfix, Postponed, so the file it just wrote fails the 'status-vocab' gate in 'giwt plan validate' on the very next run.

The same command also leaves .plan/feature-matrix.md stale, failing the 'matrix' gate, because it does not regenerate the matrix.

Hit while resyncing a ticket status that a sibling worktree had closed on the shared issue tracker. The fix on that branch was: write 'Done' by hand, then run 'giwt plan matrix' to regenerate.

Two asks: map the closed state onto the canonical 'Done' rather than 'done', and regenerate the feature matrix as part of the fix pass so one command leaves plan state consistent.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
