<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness work-topic TUI surface

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** `.plan/epics/epic-harness-integration.md`
**Tags:** harness, tui
**Summary:** Work-topic column, F4 cycle filter, and status-bar indicator on the EXISTING `src/tui/harness/` overlay — rows and a key handler, zero new widgets.
**Context:** The overlay already exists and already has the seams this needs: `loadRuns` / `setFetch` (`src/tui/harness/api.ts`) and pure formatters (`src/tui/harness/display.ts`). A separate work-topic screen would violate the harness epic's no-second-TUI rule. `src/tui/app.ts` is where the status bar and key conventions live.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Work-topic column added to the run list via `formatRunLine` (`src/tui/harness/display.ts`) — a formatter change, not a widget change.
- [ ] `F4` cycles the run list through topic filters (all → per-topic → all); the active filter is visible in the list header.
- [ ] Topic indicator added to the status bar in `src/tui/app.ts`, sourced from the currently attached work topic.
- [ ] Zero new blessed widgets. The overlay grows rows and a key handler only; it rides the existing `loadRuns` / `setFetch` seam (`src/tui/harness/api.ts`).
- [ ] `formatRunLine` unit tests cover the no-topic case (renders as an explicit placeholder, not empty) and long-topic-name truncation.
- [ ] `bun run check` green with no new coverage waiver added.

## Related Files

- `src/tui/harness/display.ts` (`formatRunLine`), `src/tui/harness/api.ts` (`loadRuns`, `setFetch`), `src/tui/harness/index.ts`
- `src/tui/app.ts` (status bar, key conventions)
- `.plan/epics/epic-harness-integration.md` (no-second-TUI rule)
- `TASK-harness-work-topics`, `TASK-tui-shell-testability`

git issue: d8c69da
