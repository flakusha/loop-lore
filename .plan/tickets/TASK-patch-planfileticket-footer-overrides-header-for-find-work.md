<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Patch planFileTicket footer-overrides-header for /find-work

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Root cause of /find-work re-emitting closed tickets: `planFileTicket` (~/.omp/agent/extensions/commands/find-work/roster.ts:89) uses `lines.find(STATUS_LINE_RE)` and picks the first match. The plan template writes `**Status:** Not Started` at line 6 of every ticket at create time, and this stale frontmatter wins over the authoritative body block (line 14+) where real status lives.

Loop-lore repo-local fix landed in two batches:
- chore-find-work-status-stale-frontmatter (cf326e28 / 854b1284, 3 tickets)
- chore-find-work-status-stale-frontmatter-sweep (5d67c783, 22 tickets)

But every future ticket created via `giwt ticket` will re-introduce the bug because the template still emits `**Status:** Not Started`. The right fix is in the harness.

**Acceptance Criteria:**
- planFileTicket scans lines from the bottom (or skips frontmatter block)
- Replay test: file with `**Status:** Not Started` at line 6 + `**Status**: closed` at line 14 → skip=true
- No regression on legitimately-open tickets (yaml-frontmatter `status: open`)
- Optional: drop the plan-template frontmatter in `giwt ticket` so new tickets never have stale `Not Started`

**Context:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
