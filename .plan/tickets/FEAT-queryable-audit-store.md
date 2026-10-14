<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Queryable Audit Store

**Status:** Done
**Priority:** high
**Effort:** Large
**Summary:** Queryable Audit Store
**Context:** Epic proposed:epic-audit-store; tags audit, logging.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** proposed:epic-audit-store
**Tags:** audit, logging

## Summary

Implement queryable, tamper-evident audit log (who/called what/on what/result); distinct from logger/.
Source: docs/meta/assessments/agentic-workspace.md.

## Resolution

Already implemented on dev — verified 2026-09-19 docs-gap reconcile audit (epic-docs-vs-plan-gap-audit-2026-09-19.md):

- src/routes/admin/audit.ts + audit.test.ts
- src/routes/nsfw-moderation/audit.ts

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
