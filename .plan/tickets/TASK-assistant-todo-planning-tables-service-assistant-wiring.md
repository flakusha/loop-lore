<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Assistant todo planning: tables, service, assistant wiring

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-assistant-step-planning
**Tags:** assistant, planning, todo

## Summary

Side-channel step planning distinct from direct chat. Migration adds plan_items (kind story|task|context|step|creative|draft, state todo|doing|done|blocked, position, parent_id) + plan_links (blocks|relates|derives|references). src/planning/service.ts CRUD + state machine; workflow-runner.ts emits steps, workflow-session-store holds active plan id; chat panel htmx partial. Acceptance: multi-step flow shows advancing steps; ownership test (A cannot touch B plans); check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
