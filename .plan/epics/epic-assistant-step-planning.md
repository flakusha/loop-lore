<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Assistant Step Planning Surfaces (Todo / Kanban / Graph)

**Overview:** Three planning surfaces (todo / kanban / graph) over one planning-item model, giving the assistant a side-channel for multi-step flow tracking distinct from direct chat. Backend: SQLite tables + REST API. Frontend: htmx/Alpine views reusing existing chat/panel patterns.

**Status:** In Progress
**Status Note:** In Progress (verified 2026-10-18 against `dev` at `08ef7efe7` — by file existence on `dev`, line-level reads of each cited path, and a `git log dev..<branch>` check that excludes unmerged work). The previous "Not Started" note in this file (dated 2026-10-09) was false: commit `1793c87c1` landed the backend the same day. SHIPPED AND LIVE: the `plan_items` + `plan_links` tables (`src/db/migrations/049_plan_items.ts:23` and `:45`, indexes at `:37`/`:41`/`:54`/`:58`); the planning service — CRUD plus an enforced todo/doing/done/blocked state machine and link management (`src/planning/service.ts:75`, illegal transitions throw and leave the row untouched); the assistant bridge projecting workflow steps onto plan rows (`src/planning/workflow-bridge.ts:26`); the REST surface (`src/routes/planning.ts:32`, nine endpoints under `/api/plans`) which is mounted at `src/routes/v1/base-surface.ts:67` and reached via `src/routes/v1/index.ts:59` (NOT `elysia-app.ts`); and the todo htmx partial (`src/views/partials/planning-todo.html:10`). Unit coverage ships with all of it (`src/planning/service.test.ts`, `src/planning/workflow-bridge.test.ts`). REMAINS: the kanban board and the graph view. The kanban implementation (`src/planning/board.ts`, `src/routes/planning-board.ts`, `src/components/planning/kanban.html`) exists only on the UNMERGED `step-planning-kanban` branch (3 commits) and is deliberately not counted; the graph view has no code on `dev` at all. Two gaps also remain inside the shipped todo slice: `emitWorkflowPlanSteps` has no caller in `src/assistant/workflow-runner.ts` (grep finds it only in its own test), so the runner still does not emit plan steps, and `planning-todo.html` is not rendered by any view or route. The per-item Tasks/Acceptance-Criteria checklists further down this file are stale in the same way and are left for a follow-up pass.
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** assistant, planning, todo, kanban, graph, visualization
**Related:** epic-workflow-engine.md, epic-assistant-creative-studio-workflows.md, epic-assistant-gm-flows.md, epic-rag-context-sources.md, epic-analytics-observability.md, epic-project-spaces-pm-integration.md

## Current State (verified 2026-10-18 against `dev`)

### Backend: 🟡 Partial — service + REST ship, assistant wiring does not

- `plan_items` / `plan_links` exist (`src/db/migrations/049_plan_items.ts`)
- `src/planning/` exists: `service.ts` (CRUD, state machine, links) and `workflow-bridge.ts` (workflow-step emission)
- Planning REST API exists and is mounted (`src/routes/planning.ts`, via `src/routes/v1/base-surface.ts:67`)
- Assistant tool wiring (`plan.add` / `plan.advance` / `plan.list`) and workflow-runner emission are NOT wired

### Frontend: 🟡 Partial

- Todo htmx partial exists (`src/views/partials/planning-todo.html`) but no view or route renders it
- Kanban board: unmerged branch `step-planning-kanban`, not on `dev`
- Graph view: no code on `dev`

### Dependencies: 🟡 Partial

- `epic-workflow-engine.md` — workflow-runner exists (`src/assistant/workflow-runner.ts`), but no planning emission yet
- `TASK-rag-knowledge-graph` — not landed; graph view will use `asset_links` + `plan_links` only
- `FEAT-memory-visualizer` — not landed; graph view will use SVG/DOM rendering

## Summary

Step-by-step planning surfaces for the assistant, distinct from direct assistant chat communication. Three views over one planning-item model: (1) todo list (harness-style step tracking: pending/active/done per plan), (2) kanban (story / task / context / steps / creative / drafts columns for story planning, task planning, context planning, steps planning, creative planning, drafting ideas), (3) graph (visual interconnections between context RAG items, stories, chats, memories, assets). Backend is a small set of tables + query APIs; frontend is htmx/Alpine views reusing existing chat/panel patterns (no canvas lib, no new framework).

## Scope

- Planning-item model: `plan_items` (id, owner, kind: story|task|context|step|creative|draft, title, state: todo|doing|done|blocked, position, parent_id, linked entity refs) + `plan_links` (from_id, to_id, relation: blocks|relates|derives|references). One migration, append-only.
- Todo API + assistant tool: assistant creates/advances steps (`plan.add`, `plan.advance`, `plan.list`) during multi-step flows; direct chat stays untouched — planning is a side channel surfaced in the chat panel.
- Kanban board view: columns by state (or by kind-swimlane for story/task/context/creative/drafts), drag or button-move between columns, per-card links to chats/stories/RAG items. htmx partials, Alpine for drag.
- Graph view: nodes = plan items + linked chats/stories/RAG documents/entities/assets; edges = `plan_links` + existing `asset_links` + knowledge-graph relationships (read-only reuse of TASK-rag-knowledge-graph storage, FEAT-memory-visualizer over asset_links). SVG/DOM rendering (no canvas dependency); read-only first, editing later.
- Ownership + access: items inherit chat/world visibility; no cross-user leaks (follow existing `checkChatAccess` pattern).

## Non-Goals

- No full project-management suite (no sprints, burndown, permissions matrix).
- No new graph database; SQLite tables only, reuse `knowledge_graph_entities/relationships` if TASK-rag-knowledge-graph lands first.
- No workflow DAG execution engine changes — epic-workflow-engine.md owns template runtime; this epic owns the planning *surface* on top.

## Design

```
src/planning/          # service: items CRUD, links, state machine (todo|doing|done|blocked)
  service.ts           # one cohesive module first; split only if >250L (epic-file-splitting pattern)
src/routes/planning.ts # REST: GET/POST /api/plans, /api/plans/:id/advance, /api/planning/board, /api/planning/graph
src/views/planning/    # htmx partials: todo list, kanban board, graph (SVG)
```

- Assistant wiring: `src/assistant/workflow-runner.ts` emits plan steps to `src/planning/service.ts` (append, never rewrite history); `workflow-session-store.ts` holds active plan id per session.
- Kanban ↔ todo same rows, different projection (state column vs ordered list). Graph is links + neighbor expansion (1-hop default, 2-hop on demand — `ponytail:` O(n^2) full-graph render avoided; cap nodes at 200 with "show more" paging).

## Tasks

- [ ] Database migration: `plan_items` + `plan_links` tables
- [ ] `src/planning/service.ts` — CRUD, state machine, link management
- [ ] `src/routes/planning.ts` — REST API (GET/POST /api/plans, advance, board, graph)
- [ ] Assistant tool wiring: `plan.add`, `plan.advance`, `plan.list` tools
- [ ] Workflow-runner emission: emit plan steps to planning service
- [ ] Todo list view (htmx partial + Alpine)
- [ ] Kanban board view (htmx partial + Alpine drag)
- [ ] Graph view (SVG/DOM rendering, 1-hop default)
- [ ] Ownership enforcement (checkChatAccess pattern)
- [ ] Tests: migration roundtrip, API, state machine, ownership

## Acceptance Criteria

- [ ] Assistant multi-step flow creates visible todo steps; advancing steps updates all three views from the same rows.
- [ ] Kanban covers story/task/context/steps/creative/drafts kinds; moving a card updates todo state.
- [ ] Graph shows 1-hop links between a plan item and its chats/stories/RAG items/assets; capped at 200 nodes with paging.
- [ ] Ownership enforced: user A cannot read/write user B plans (test).
- [ ] `bun run check` green; tables covered by migration + roundtrip tests.

## Dependencies

- Prerequisite: none (standalone tables). Reuses but does not block on TASK-rag-knowledge-graph (entity storage) and epic-workflow-engine (template runtime).


## Files

- `src/planning/service.ts` — planning item CRUD, state machine, link management (to be created)
- `src/routes/planning.ts` — REST API (to be created)
- `src/views/planning/` — htmx partials: todo, kanban, graph (to be created)
- `src/assistant/workflow-runner.ts` — existing; will emit plan steps
- `src/assistant/workflow-session-store.ts` — existing; holds active plan id per session

## Tickets

- `TASK-assistant-todo-planning-tables-service-assistant-wiring.md` — `plan_items`/`plan_links` tables, planning service, assistant tool wiring
- `TASK-kanban-board-for-story-task-context-creative-drafts-planning.md` — kanban board view over the planning-item model

Verified 2026-10-18 against `dev`: `TASK-assistant-todo-planning-tables-service-assistant-wiring` is In Progress (tables, service, REST and tests ship; the assistant tool wiring and workflow-runner emission its title names do not). `TASK-kanban-board-for-story-task-context-creative-drafts-planning` is Not Started — its implementation lives only on the unmerged `step-planning-kanban` branch. Dependency tickets (not owned by this epic): `TASK-rag-knowledge-graph.md` (entity storage reuse) and `FEAT-memory-visualizer-knowledge-graph-over-asset-links.md` (graph rendering reuse).

## References

- git issue: 07f52a6
