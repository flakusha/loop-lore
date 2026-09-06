<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Admin module cleanup: index.ts exports, consistent error handling, test isolation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

S1: src/admin/model-roles.ts reads swallow DB errors (try/catch + warn, fallback) while writes (set/clearModelRoleOverride) propagate - pick one strategy and document. S2: no src/admin/index.ts; callers import subfiles directly (../../admin/model-roles etc.) - add index.ts re-exporting public API per AGENTS.md convention. S3: src/admin/provider-health.test.ts shares global state.cache across tests via module mock - reset cache between tests. Verify: bun run check clean, bun test src/admin/ green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
