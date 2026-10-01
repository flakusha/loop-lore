<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Project Spaces — World-Like Business Project Isolation + Cross-Space Linking

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** projects, spaces, worlds, planning, giwt, assistant, memory, linking
**Related:** epic-task-management-integration.md, epic-assistant-step-planning.md, epic-workflow-engine.md, epic-assistant-gm-flows.md, epic-tooling-improvement.md, epic-use-case-agentic-workspace.md, epic-worlds-extension.md, epic-memory-isolation-design.md

## Summary

Business projects get world-like isolation: each project lives in its own space for planning (tickets, todos, kanban, memory, assets), reusing the `worlds` row + visibility/ownership/invites machinery with a new `kind: "project"` instead of a parallel table. Cross-space work (shared tickets, referenced decisions, carried memory) goes through explicit links with visibility checks — never implicit leakage. Assistant drives space lifecycle via workflow YAML templates; giwt stays the `.plan/` source of truth (loop-lore writes through, never duplicates).

## Scope

- Project space model: `WorldKind += "project"` (`src/db/enums-story/world.ts` + validation), `rpg_enabled` forced 0, planning/memory/asset queries scoped by space id. No new top-level table; no CHECK-constraint migration (001_init `kind` is plain text).
- giwt/`.plan` bridge: space lifecycle ops (create/archive/move item across spaces) write through to giwt index + git issues; `TASK-MANAGEMENT-INTEGRATION` owns the `loop-lore task` CLI + `/admin/tasks` panel, this epic adds space filter + move ops on top.
- Assistant flows: PM workflow templates (`configs/templates/workflows/pm-*.yaml`: space-create, ticket-triage, status-advance) routed via existing `matchWorkflowTrigger`/`matchWorkflowIntent`; dispatch backend `plan-bridge`; approval `confirm`; runner untouched.
- Harness flows: one-row + workflow-note update to `loop-lore-tasks` skill docs; `ctx_*`/hub usage unchanged; no new skill.
- Cross-space linking + memory: `plan_links` relation `references` across spaces with target-visibility check (`checkChatAccess` pattern); memory stays world-scoped (`checkScope` rejects cross-space by default); explicit shared-memory carry with audit entry.

## Non-Goals

- No full PM suite (no sprints, burndown, permissions matrix) — step-planning epic owns the same non-goal.
- No new graph DB; reuse `plan_links` + `asset_links` + knowledge-graph storage.
- No giwt replacement; no parallel ticket state in loop-lore DB.
- No workflow-runner or template-loader changes (config-only new templates).

## Design

### 1. Space = world with kind project

```
WorldKind { rpg, chat } → += project  # src/db/enums-story/world.ts
# validation: project spaces force rpg_enabled=0, ignore travel/location bindings
# visibility/owner/invites/asset_links(entity_type=world)/memory-scope all reused
```

- `ponytail:` kind-value extension, not a migration; if a CHECK lands later, fold into that migration.
- Space-scoped queries: planning items carry `space_id` (= world id); list/board/graph filter by it (rides `epic-assistant-step-planning.md` `plan_items` — if that lands first, `space_id` is a column there; else this epic defines the scoping contract it must satisfy).

### 2. giwt bridge (no parallel state)

- Lifecycle ops call through to giwt (index + git issue), same as `loop-lore task` CLI contract in `TASK-MANAGEMENT-INTEGRATION.md`.
- `move item across spaces` = close-in-source (link to target) + open-in-target with `derives` link; both sides audit-logged (operator, action, ticket, timestamp).
- `/admin/tasks` gains space filter; polls giwt sync (30s htmx, same contract).

### 3. Assistant PM workflows (config-only)

- `pm-space-create.yaml` (triggers: "new project", "create space"), `pm-triage.yaml` ("triage tickets"), `pm-status.yaml` ("advance status").
- Steps: text/choice via existing `WorkflowStepConfig`; dispatch `{backend: plan-bridge, target: giwt-op}`; `approval: {type: confirm, preview: true}`.
- Routing: `intent.type` maps into existing `AssistantIntent` taxonomy; session store holds active PM plan id per chat (step-planning §Design).

### 4. Harness (docs-only)

- `loop-lore-tasks` SKILL.md: add `Business project spaces → .plan/epics/epic-project-spaces-pm-integration.md` row + "scope queries by space; move via derives-link, never copy" note.
- No skill/hook/`ctx_*` changes; agent workflow otherwise unchanged.

### 5. Cross-space links + memory

- `plan_links(from_id, to_id, relation)`: `references` may cross spaces; write path checks target-space visibility for the viewer, else reject (ownership test required).
- Graph view: 1-hop neighbor expansion crosses spaces only through `references` edges, labeled with source space; 200-node cap + paging (step-planning rule).
- Memory: `scope: world` + `checkScope` already rejects cross-space reads — keep default-deny; cross-space carry = new explicit `shared` entry quoting the source (provenance: source space id + actor + timestamp), never silent injection.

## Acceptance Criteria

- [ ] `kind: project` space isolates planning/memory/assets; user A cannot read user B space (test, `checkChatAccess` pattern).
- [ ] Move-item across spaces preserves both sides + audit log; no duplicated primary state (giwt index is sole source).
- [ ] Assistant `pm-*` workflows trigger from chat, preview steps, require confirm before any giwt write.
- [ ] Cross-space `references` link renders in graph with source-space label; invisible target rejected.
- [ ] Skill docs updated; `bun run check` green (incl. `plan:validate`, `plan:sync`, code-map freshness).

## Dependencies

- Builds on: `epic-assistant-step-planning.md` (`plan_items`/`plan_links` tables; else define scoping contract first).
- Reuses, never modifies: `epic-workflow-engine.md` (runner/loader), giwt CLI + gates.
- Extends: `TASK-MANAGEMENT-INTEGRATION.md` (CLI + `/admin/tasks` panel), `epic-memory-isolation-design.md` (scope enforcement).

## Integration Points

- giwt/`.plan`: write-through only; gates `plan:validate` (naming/format/linkage/status-vocab) + `plan:sync` must stay green.
- Assistant: `src/assistant/workflow-routing.ts`, `workflow-runner.ts`, `workflow-session-store.ts`, `configs/templates/workflows/`.
- Worlds/memory: `src/db/enums-story/world.ts`, `src/db/schema-story.ts` (`worlds`), `src/memory/provision.ts` (`checkScope`), `asset_links` (`entity_type=world`).
- Skills: `.agents/skills/loop-lore-tasks/SKILL.md`.
