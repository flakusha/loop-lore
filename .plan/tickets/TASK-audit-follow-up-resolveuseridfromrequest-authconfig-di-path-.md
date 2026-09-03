<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit follow-up: resolveUserIdFromRequest authConfig DI path untested

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

Audit found c9ca8edd added optional 4th authConfig param to resolveUserIdFromRequest for DI of pre-loaded AuthConfig. Both call sites in src/routes/export.ts and src/routes/export-sse/start.ts still pass only 3 args, so the optimized DI path is never exercised in production and has zero test coverage. Either wire DI or drop the unused param. See audit .audit-batch-A-message-seen-gen.md finding MEDIUM.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
