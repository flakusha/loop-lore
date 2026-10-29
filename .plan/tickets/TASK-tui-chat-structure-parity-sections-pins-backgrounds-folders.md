<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TUI chat structure parity: sections, pins, backgrounds, folders

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-terminal-ui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Chat parity gap slice 2 from harness-app-reuse gaps.md: TUI lacks chat sections, pins, backgrounds, folders (web has all four). Read-first parity: TUI transcript shows section markers + pinned messages + background/ambience label + folder membership; minimal write paths only where terminal-safe (pin/unpin toggle), folder assignment stays web-only per form-heavy carve-out if it proves page-shaped.

Owner: epic-terminal-ui.md (In Progress; web parity in scope where it suits a terminal).

Acceptance: pinned messages surfaced in TUI transcript; section boundaries render; background label visible; folder membership shown; pin/unpin toggle works from TUI with server round-trip; stubbed api tests; bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
