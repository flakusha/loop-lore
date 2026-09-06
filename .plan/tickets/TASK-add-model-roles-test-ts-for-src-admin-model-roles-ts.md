<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add model-roles.test.ts for src/admin/model-roles.ts

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

resolveModelRole is called from src/aux-pipeline/runner.ts:66 and src/generation/caption-route.ts:76,78 but has zero test coverage (no model-roles.test.ts exists; admin suite is 20 pass / 0 fail across 3 files without it). Add src/admin/model-roles.test.ts covering: DB override resolution, config fallback, server-default fallback, missing config.generation graceful degradation, invalid role rejection, resolveAllModelRoles, set/clear/get override CRUD. Evidence: bun test src/admin/ passes without exercising any of these paths.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
