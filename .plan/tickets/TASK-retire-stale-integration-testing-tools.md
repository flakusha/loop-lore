<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Update or retire stale integration-testing-tools.md

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** low
**Effort:** Small

## Summary

`docs/meta/integration-testing-tools.md` describes a custom router (`src/routes/router.ts`) and recommends Zod (sections 1.1, 2.1, 4.1), plus `@asteasolutions/zod-to-openapi` and Pact/Schemathesis rollout phases. Current project truth: Elysia + TypeBox + OpenAPI generation. The document introduces a second router/schema convention that no part of the codebase uses.

## Where

- docs/meta/integration-testing-tools.md

## Acceptance Criteria

- [ ] Document is either updated to reflect Elysia + TypeBox + OpenAPI generation or retired.
- [ ] No mention of Zod, custom router, Pact, or Schemathesis remains as current recommendation.
- [ ] No documentation cross-reference assumes the stale router exists.


git issue: 7282dd8
