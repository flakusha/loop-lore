<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: giwt new --scope without --tickets attempts an empty commit and exits 1

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Tags:** infra

**Summary:**

Observed 2026-10-04 running giwt new review-bugs-2026-10-04 --scope ...: branch, worktree, links and the giwt-scoped.json marker were created, then the command exited 1. Cause (verified 2026-10-04 in both the invoked checkout /home/flak/git-ai/giwt and the pinned node_modules copy, src/commands/scoped-worktree.ts:196-202, applyScopedTickets): with zero tickets it still runs git add -f .plan/tickets followed by git commit -m 'chore(tickets): scope 0 ticket(s)...'; nothing is staged, so git commit exits 1 after the pre-commit hook prints 'No staged files to check - skipping'. The worktree is fully usable, but every scope-only creation reports failure and the scope header is never persisted into a ticket. Fix: skip the commit when the resolved ticket list is empty. Effort small.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
