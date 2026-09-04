<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: migrate.ts loader imports *.test.ts files from src/db/migrations/, breaks unrelated tests

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

**What**: src/db/migrate.ts:13-24 uses non-recursive readdirSync on src/db/migrations/ and then await import()s every .ts file. Any *.test.ts file placed in src/db/migrations/ gets re-imported at migrate time and re-registers its describe() inside whatever test currently holds the migrator, causing bun:test to fail with 'Cannot call describe() inside a test. Call it inside describe() instead.'\n\n**Why**: This bit the 076 review — I had to move migration-076.test.ts out of src/db/migrations/ to src/db/ with a workaround. The same hazard will hit every future migration that wants a colocated .test.ts.\n\n**Where**: src/db/migrate.ts:13-24\n\n**Trigger code**:\n\n\n**Suggested fix**: Filter test files at the loader:\n\n\n**Related debt**: This is the same root cause as the existing 'Migration hygiene #1' debt in .plan/backlog/open-debt.md (loader does non-recursive readdirSync filtered on top-level .ts, so parts/*.ts never load). Both issues can be addressed together by making the loader recursive and filtering properly, OR by tightening the filter and leaving non-recursive.\n\n**Refs**: commit 122f8e61, 1b9b0cdf, .plan/backlog/open-debt.md 'Migration hygiene'

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
