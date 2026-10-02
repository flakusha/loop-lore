<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Workflow DAG engine — task dependencies

**Status:** Done
**Priority:** medium
**Effort:** Large
**Summary:** Task-dependency DAG execution engine for multi-step agentic workflows
**Context:** Extracted 2026-09-19 docs-gap reconcile (remainder of closed FEAT-workflow-dag-engine-task-dependencies-scheduler; scheduler core shipped via epic-cron-scheduler + src/cron/)
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-workflow-engine
**Tags:** agentic, workflow, dag
**Related:** epic-cron-scheduler.md (Done - the shipped time-triggered registry this extends), epic-assistant-step-planning.md (planning surface, explicitly excludes DAG execution), docs/spec/use-case-agentic-workspace.md (conceptual mapping: task dependencies = DAG)

## Summary

Implement a `task_dependencies` model and DAG execution engine on top of the shipped scheduler (`src/cron/registry.ts`, `epic-cron-scheduler.md` ✅ Done): tasks declare dependencies; the engine dispatches a task only when its dependencies complete, handles failure propagation (skip vs retry dependents), and exposes per-node status. No plan artifact covers the dependency/DAG layer (verified 2026-09-19: `DAG`, `task dependenc` searches → only the closed audit ticket).

Source: docs/meta/admin-visibility-research.md workflow-automation section; extraction E16 of epic-docs-vs-plan-gap-audit-2026-09-19.md.


## Filing note

Re-pointed 2026-10-02 from `epic-actor-autonomy-story-drive` to
`epic-workflow-engine`. Greenfield: `task_dependencies` exists nowhere in `src/`
(no table, no type, no migration), and there is no DAG engine either — the only
workflow runtime is the linear step pipeline in
`src/assistant/workflow-runner.ts` (`startWorkflow`, `previewSteps`, `buildStep`,
`assemblePrompt`, `confirmAndDispatch`), which walks `workflow.steps` in array
order and has no concept of one step depending on another.

The epic this was filed under had no claim on it, and neither of the two epics
its Context names does:

- `epic-actor-autonomy-story-drive` owns the autonomy loop (cadence, governor,
  dispatch targets). A generic task-dependency DAG for multi-step agentic
  workflows is not autonomy work, and nothing in that epic's scope mentions
  task dependency or DAG execution.
- `epic-cron-scheduler` is the registry this ticket builds on, and the ticket's
  own Context is explicit that its core already shipped there. But that epic is
  **Done**, and its Scope is a bounded list of registry/lifecycle work
  (`src/cron/registry.ts`, timer migration, memory decay/purge schedules, admin
  observability, docs). Its Non-Goals rule out replacing the event bus, and
  dependency-ordered dispatch is a different axis from time-triggered dispatch.
  Filing new work there would re-open a closed epic for something it scoped out.

`epic-workflow-engine` is the epic that owns multi-step workflow execution, so
the dependency layer belongs with it — with the caveat that it disowns a
*workflow* DAG today: `epic-assistant-step-planning.md` Non-Goals say "No
workflow DAG execution engine changes — epic-workflow-engine.md owns template
runtime; this epic owns the planning surface on top", and
`epic-workflow-engine.md`'s own open tasks are all linear-pipeline items. So this
is a genuine scope addition, not a fit to existing text; that epic's status note
should be updated when this lands.

Provenance caveat, recorded so the next reader does not trust the cited source:
the Source line above claims a `docs/meta/admin-visibility-research.md`
workflow-automation section, but that file contains no `DAG` or `task dep`
match. The real traceable origin is extraction E16 of
`epic-docs-vs-plan-gap-audit-2026-09-19.md`, which lists workflow-dag-engine under
"Agentic Substrate (7)"; that epic's consolidation line (line 141) sends the
agentic cluster to `epic-agentic-execution-substrate.md` — an epic that was never
created (no such file in `.plan/epics/`). So this ticket's home was never
materialised.

Counter-evidence, recorded because it is the strongest argument against this
re-point: the same audit's reconcile checklist (line 148) closed the P0/P1
admin+agentic tickets as duplicate/partial and deliberately parked their
"remainders ... in epic-analytics-observability / epic-actor-autonomy-story-drive".
Parking a remainder in this epic was a considered consolidation decision, not a
default. This file is a counter-case to that one only: it is one of the audit's 3
new slim tickets (line 164, alongside TASK-human-in-the-loop-tool-approval-gates
and TASK-profanity-filter-hot-reload-per-chat-sensitivity), a category the audit
handled separately from remainders, and it is a scheduler concern rather than a
story-loop one. Reverted 2026-10-02. If the 2026-09-19 decision should stand, the
reversal is one edit to the `**Epic:**` line above and the rest of this note still
applies.

Left bound rather than made unbound: an unbound ticket only raises a warn-level
advisory, and both alternative owners are worse (see above).

## Acceptance Criteria

- [ ] Schema: `task_dependencies` (task_id, depends_on_task_id, on_failure: skip|retry) with cycle detection at insert
- [ ] Engine: dependent dispatch on dependency completion; failure policy honored
- [ ] Status surface: per-node state (blocked/ready/running/done/failed/skipped)
- [ ] Unit tests: diamond DAG, cycle rejection, failure-skip, failure-retry
- [ ] `bun run check` passes

**Resolved:** 2026-10-03 registry-driven close: git issue 328dee7 (registry tip: d07beb65e Konstantin Fedotov Auto-closed: appended .md marker marks TASK-WORKFLOW-DAG-ENGINE-TASK-DE)
