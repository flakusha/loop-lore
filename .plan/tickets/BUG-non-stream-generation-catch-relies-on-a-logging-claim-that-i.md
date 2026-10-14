<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: non-stream generation catch relies on a logging claim that is false

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

The catch around failGeneration in the non-stream generate route is justified by a comment saying failGeneration already logs errors. That is not true: handleGenerationError's own catch at src/generation/auto-gen/handle-generation-error.ts:38 swallows the failure with no log, so with the DB down neither the original error nor the persistence failure reaches the log.

Evidence read on dev:

- src/generation/generate-route/non-stream.ts:252-254 — catch { // failGeneration already logs errors }

Sibling sites already filed under BUG-generation-service-silent-catch-blocks-mask-production-error (resolve-known-names.ts:65, handle-generation-error.ts:38 and :59); this one is a fourth site in the same family and is outside that ticket's stated scope.

Source: .tmp/longcat/review-chat.md finding 6.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
