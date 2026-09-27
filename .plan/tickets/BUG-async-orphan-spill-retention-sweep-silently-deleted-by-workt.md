<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Async orphan-spill retention sweep silently deleted by worktree fold

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:** async orphan spill retention sweep silently deleted by workt
**Context:** Context: 81343b060 (09-26 fold) removed src/async/spill-retention.ts (75 lines), the pruneOrphanSpills phase in runOffloadPass, its tests and CHANGELOG entry — undoing bdd0b66d3 landed hours earlier.
**Acceptance Criteria:** restore spill-retention.ts + sweep phase + tests from 3961cbbe0.

## Summary

Context: 81343b060 (09-26 fold) removed src/async/spill-retention.ts (75 lines), the pruneOrphanSpills phase in runOffloadPass, its tests and CHANGELOG entry — undoing bdd0b66d3 landed hours earlier. Severity: blocking. Orphaned .json.gz spill files (DB resets, deleted rows, aborted runs) accumulate unbounded again; 279 never-pruned files were the observed incident. Repro: git show 81343b060 -- src/async/spill-retention.ts; insert orphan row and run an offload pass — no prune. Fix: restore spill-retention.ts + sweep phase + tests from 3961cbbe0.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
