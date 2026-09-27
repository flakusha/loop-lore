<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: CLARIFY-prompt-improve-route-path-reconciliation

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-prompt-improvement.md
**Tags:** docs, prompt-improve
**Summary:** Reconcile stale prompt-route path strings with the single live mount POST /api/v1/generation/prompt.
**Context:** Prompt-improve route-path drift across TASK-prompt-improve-shared-service, TASK-prompt-improve-composer-ui, and src/generation/prompt-route.ts header.
**Acceptance Criteria:** Green prompt-improve tests plus corrected path strings.

## Summary

Reconcile stale /api/generation/prompt references (TASK-prompt-improve-shared-service scope, TASK-prompt-improve-composer-ui scope, src/generation/prompt-route.ts header) with the single live mount POST /api/v1/generation/prompt in src/generation/controller.ts. Acceptance: green prompt-improve tests plus corrected path strings.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
