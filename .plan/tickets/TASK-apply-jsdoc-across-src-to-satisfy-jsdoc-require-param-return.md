<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Apply JSDoc across src/ to satisfy jsdoc/require-{param,returns,throws}

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

After lifting jsdoc/* rules to error in eslint.config.mjs, baseline scan reports 674 violations across 217 non-test files in src/. Partition by directory and apply concise JSDoc per AGENTS.md minimal policy.

Breakdown:
- jsdoc/require-throws: 49 violations across 36 files (priority — JS has no throw-signal via types)
- jsdoc/require-returns: dominant (majority of 674) — functions returning non-void
- jsdoc/require-param: smaller subset — functions with non-obvious parameters

Exempt files: src/db/schema*.ts, src/validation/db-schemas.ts, src/test-utils/insert-helpers.ts, src/**/*.test.ts (already exempted in eslint.config.mjs).

Approach:
1. Add @throws {Error} When <condition> on functions whose body throws / returns Result.err / rejects Promise
2. Add @returns only when non-obvious from signature
3. Add @param only when name clarifies
4. Keep blocks ≤3 lines

Suggested partition by directory (alphabetical snake):
- Batch A: characters/, crypto/, battle/, auth/, aux-pipeline/, build/
- Batch B: chat/, assets/, config/, federation/, cron/, content/, async/
- Batch C: generation/, frontend/, middleware/, logger/, hash/, image-edit/, nsfw/

Each batch should be one or two worktrees (one commit per batch to avoid mega-PRs).
Run bun run check between batches; rule lifts must remain green for unrelated gates.

Evidence stored in tree/jsdoc-liftup/.tmp/:
- non-test-throws.txt: per-subdir require-throws breakdown (49 errors / 36 files)
- all-rules-files.txt: per-file all-rules breakdown (674 errors / 217 files)
- group-A.txt, group-B.txt: partition lists

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
