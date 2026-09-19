<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Human-in-the-loop tool approval gates

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Generic per-tool-call approval workflow for agentic tools (pause → approve/reject → resume)
**Context:** Extracted 2026-09-19 docs-gap reconcile (remainder of closed FEAT-human-in-the-loop-approval-gates; entity-creation approval shipped — src/routes/messages/create-entity-confirm.test.ts, epic-entity-generation-workflows.md:87)
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-plugin-system
**Tags:** agentic, tools, safety, approval

## Summary

Generalize the existing entity-creation confirmation pattern into a reusable per-tool-call approval gate: plugin tools (or tool classes) marked as requiring approval suspend execution, surface the pending call + arguments to the operator, and resume or abort on decision. Entity-creation is the only approved-gate path today; a generic mechanism for agentic tools is unplanned (verified 2026-09-19).

Source: docs/meta/admin-visibility-research.md agentic-substrate section; extraction E17 of epic-docs-vs-plan-gap-audit-2026-09-19.md.

## Acceptance Criteria

- [ ] Tool-level opt-in: per-tool/per-class `requiresApproval` registration
- [ ] Suspension + resume/abort semantics with durable pending-call state
- [ ] Operator surface: pending approvals list with arguments preview
- [ ] Unit tests: approve resumes, reject aborts, timeout policy
- [ ] `bun run check` passes
