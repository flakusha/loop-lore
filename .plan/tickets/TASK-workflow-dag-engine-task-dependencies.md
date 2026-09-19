<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Workflow DAG engine — task dependencies

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Summary:** Task-dependency DAG execution engine for multi-step agentic workflows
**Context:** Extracted 2026-09-19 docs-gap reconcile (remainder of closed FEAT-workflow-dag-engine-task-dependencies-scheduler; scheduler core shipped via epic-cron-scheduler + src/cron/)
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-actor-autonomy-story-drive
**Tags:** agentic, workflow, dag

## Summary

Implement a `task_dependencies` model and DAG execution engine on top of the shipped scheduler (`src/cron/registry.ts`, `epic-cron-scheduler.md` ✅ Done): tasks declare dependencies; the engine dispatches a task only when its dependencies complete, handles failure propagation (skip vs retry dependents), and exposes per-node status. No plan artifact covers the dependency/DAG layer (verified 2026-09-19: `DAG`, `task dependenc` searches → only the closed audit ticket).

Source: docs/meta/admin-visibility-research.md workflow-automation section; extraction E16 of epic-docs-vs-plan-gap-audit-2026-09-19.md.

## Acceptance Criteria

- [ ] Schema: `task_dependencies` (task_id, depends_on_task_id, on_failure: skip|retry) with cycle detection at insert
- [ ] Engine: dependent dispatch on dependency completion; failure policy honored
- [ ] Status surface: per-node state (blocked/ready/running/done/failed/skipped)
- [ ] Unit tests: diamond DAG, cycle rejection, failure-skip, failure-retry
- [ ] `bun run check` passes
