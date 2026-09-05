<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: context pruning is a silent no-op

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/auto-gen/context-pruning.ts:27-77 computes pruneResult, only logs (68-73), never writes visibility/delete/summary/promotion -> DB keeps every message, prune repeats each generation; comment 'promoted to memory' false; MAX_TOKENS 32000 hardcoded ignoring admin/model-capabilities getContextWindowForModel; token heuristic chars/4 vs prune.ts chars×0.3 mismatch. Fix: persist prune + promotion, wire context window.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
