<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant todo planning: tables, service, assistant wiring

**Status:** In Progress
**Status Note:** In Progress (verified 2026-10-18 against `dev` at `08ef7efe7`). Two of three acceptance criteria are met; the tables, service, REST surface and tests all ship and are live, but the workflow does not yet create visible steps. Met: (a) ownership is enforced end to end — the REST layer rejects a non-owner with a 404 (`src/routes/planning.ts:100` for GET, the same owner check on PATCH/DELETE/advance/links) and the service itself is owner-scoped (`src/planning/service.ts:77`), covered by tests including a cross-owner case (`src/planning/service.test.ts:87`, and `src/planning/workflow-bridge.test.ts:150-153` asserts another owner sees zero items); (b) the tables are covered by a migration plus roundtrip tests — `src/db/migrations/049_plan_items.ts:23` creates `plan_items` and `:45` creates `plan_links`, both exercised by `src/planning/service.test.ts`. NOT MET: "Multi-step flow creates visible steps; advancing a step updates the todo view" — `emitWorkflowPlanSteps` (`src/planning/workflow-bridge.ts:26`) has NO caller in `src/assistant/workflow-runner.ts`; grep across `src/` finds it referenced only by its own test file, so no assistant workflow actually creates plan rows. The todo partial (`src/views/partials/planning-todo.html:10`) is likewise rendered by no view or route, so "visible" is not achieved end to end even though `advance` works (`service.ts`, tested at `service.test.ts:125`). Remaining: call the bridge from the workflow runner and mount the partial in a chat view. NOTE: the kanban companion ticket is NOT counted here — its implementation exists only on the unmerged `step-planning-kanban` branch.
**Priority:** high
**Effort:** Medium
**Epic:** epic-assistant-step-planning
**Tags:** assistant, planning, todo

**Summary:** Side-channel step planning distinct from direct chat. Migration adds plan_items (kind story|task|context|step|creative|draft, state todo|doing|done|blocked, position, parent_id) + plan_links (blocks|relates|derives|references). src/planning/service.ts CRUD + state machine; chat panel htmx partial.

**Context:** Assistant multi-step flows in workflow-runner.ts currently expose no visible step state; the harness todo-list is the model. Steps are emitted as a side channel surfaced in the chat panel while direct chat stays untouched; workflow-session-store.ts holds the active plan id per session.

**Acceptance Criteria:**

- [ ] Multi-step flow creates visible steps; advancing a step updates the todo view.
- [ ] Ownership enforced: user A cannot read/write user B plans (test).
- [ ] `bun run check` green; tables covered by migration + roundtrip tests.
