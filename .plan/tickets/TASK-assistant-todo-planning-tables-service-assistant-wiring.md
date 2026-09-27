<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Assistant todo planning: tables, service, assistant wiring

**Status:** Not Started
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
