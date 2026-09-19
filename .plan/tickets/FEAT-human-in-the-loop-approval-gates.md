<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Human-in-the-Loop Approval Gates

**Status:** ✅ Done (duplicate — remainder extracted, 2026-09-19)
**Priority:** medium
**Effort:** Medium
**Summary:** Human-in-the-Loop Approval Gates
**Context:** Epic proposed:epic-approval-gates; tags approval, governance.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** proposed:epic-approval-gates
**Tags:** approval, governance

## Summary

Implement approval checkpoints before external-mutating tools (Jira, SQL writes).
Source: docs/meta/assessments/agentic-workspace.md.

## Resolution

Core scope tracked by src/routes/messages/create-entity-confirm.test.ts; epic-entity-generation-workflows.md:87. Unplanned remainder extracted 2026-09-19 → E17 generic per-tool-call HITL approval (new ticket T-B, main agent) (docs-gap reconcile audit).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
