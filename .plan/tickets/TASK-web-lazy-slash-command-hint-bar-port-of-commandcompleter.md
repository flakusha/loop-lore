<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: web: lazy slash-command hint bar (port of CommandCompleter)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-frontend-chat-commands
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

HarnessReuse Group-5 web port (T13): lazy slash-command hint bar, ported from the TUI `CommandCompleter`.

**Ground state (TUI leads):** `CommandCompleter` + `parseCommandQuery`/`matchCommands` in `src/tui/chat/commands.ts` (lazy fetch on first `/`, status-bar hint, select/commit state machine, no blessed import); registry `GET /api/v1/commands` via `loadCommands` (`src/tui/chat/api.ts:225-242`). Web commands registry exists server-side (`src/routes/commands/`, ~40 commands) but web has no equivalent lazy-hint UI wired.

**Adopt/adapt/defer:** Port direction TUI → web; no external URL for this slice (the in-repo `CommandCompleter` is the spec).

**Acceptance criteria:**

- [ ] Composer fetches `GET /api/v1/commands` lazily on first `/` (not at page load).
- [ ] Prefix-filter hint + Tab/Enter commit with trailing space (same `MAX_MATCHES`/`COMMAND_SUFFIX` semantics).
- [ ] Registry failure degrades to no-hint (never blocks send).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
