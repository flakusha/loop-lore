<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Assistant Step Planning Surfaces (Todo / Kanban / Graph)

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** assistant, planning, todo, kanban, graph, visualization
**Related:** epic-workflow-engine.md, epic-assistant-creative-studio-workflows.md, epic-assistant-gm-flows.md, epic-rag-context-sources.md, epic-analytics-observability.md, epic-project-spaces-pm-integration.md

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

## Acceptance Criteria

- [ ] Assistant multi-step flow creates visible todo steps; advancing steps updates all three views from the same rows.
- [ ] Kanban covers story/task/context/steps/creative/drafts kinds; moving a card updates todo state.
- [ ] Graph shows 1-hop links between a plan item and its chats/stories/RAG items/assets; capped at 200 nodes with paging.
- [ ] Ownership enforced: user A cannot read/write user B plans (test).
- [ ] `bun run check` green; tables covered by migration + roundtrip tests.

## Dependencies

- Prerequisite: none (standalone tables). Reuses but does not block on TASK-rag-knowledge-graph (entity storage) and epic-workflow-engine (template runtime).


git issue: 07f52a6
