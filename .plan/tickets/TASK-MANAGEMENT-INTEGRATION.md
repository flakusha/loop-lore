<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Task management integration (giwt ↔ loop-lore CLI/UI)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Summary:** Expose giwt's task/ticket management surface inside loop-lore's own CLI + admin UI so operators don't need to leave the runtime context to triage, file, or close tickets. Bidirectional sync: tickets authored in loop-lore's CLI land in giwt's index; tickets filed in giwt show up in loop-lore's admin task panel.
**Context:** loop-lore ships a CLI (`src/cli/`) and an admin panel (`src/frontend/alpine/admin/`), but the ticket-management workflow lives entirely in giwt (the outer worktree CLI). Operators running the loop-lore server in production have to shell out, losing context and audit trail. The `EPIC-TASK-MANAGEMENT-INTEGRATION` and `EPIC-UNIFIED-SPEC-FRAMEWORK` epics both require this surface; without it, plan/ticket operations are duplicated across two CLIs.
**Acceptance Criteria:** [ ] `loop-lore task <subcommand>` mirrors the giwt task surface (`list`, `show`, `create`, `state close`, `comment`). [ ] Each call writes through to giwt's underlying git-issue + index — no parallel state. [ ] Admin UI panel at `/admin/tasks` lists open tickets, lets operators transition state with one click, and shows the latest git-issue comment thread inline. [ ] When `giwt sync` reconciles the index, the admin UI updates within 30s (htmx polling). [ ] All operations are audit-logged (operator id, action, ticket id, timestamp). [ ] Tests cover: CLI ↔ giwt round-trip, admin UI state transitions, audit log entries. [ ] `bun run check` green.
**Epic:** epic-task-management-integration
**Tags:** cli, admin, tasks, giwt, integration, ticket
**Related:** giwt CLI, EPIC-UNIFIED-SPEC-FRAMEWORK, src/frontend/alpine/admin/admin-tasks.ts


git issue: eda503b
