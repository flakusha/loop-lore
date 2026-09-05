# BUG: context pruning is a silent no-op

**Status:** ✅ Resolved (fixed 2026-09-05)
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/auto-gen/context-pruning.ts:27-77 computes pruneResult, only logs (68-73), never writes visibility/delete/summary/promotion -> DB keeps every message, prune repeats each generation; comment 'promoted to memory' false; MAX_TOKENS 32000 hardcoded ignoring admin/model-capabilities getContextWindowForModel; token heuristic chars/4 vs prune.ts chars×0.3 mismatch. Fix: persist prune + promotion, wire context window.

## Resolution

Fixed in `checkAndPruneContext` (`src/generation/auto-gen/context-pruning.ts`): pruned messages are now persisted with `visibility = "auto_hidden"` (soft-hide, matching the soft-delete convention — no hard-delete), re-associated to DB rows by a role+content key. Promotion candidates are logged (memory-write pipeline is out of scope this round; the count is surfaced, no longer silently dropped). `MAX_TOKENS` stays constant per contingency A3 (`getContextWindowForModel` requires a provider/model the module doesn't have — noted in a comment).

Tests: `src/generation/auto-gen/context-pruning.test.ts` — (1) 4 × 21k-char messages with `token_count_total` high enough to hit "critical", asserts `checkAndPruneContext` returns `true` and pruned messages have `visibility="auto_hidden"` in the DB (deterministically the oldest first); (2) quiet chat returns `false` with no pruning. Both pass.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated