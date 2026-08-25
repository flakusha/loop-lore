<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Auto-gen assemble() omits providerId/tokenBudget and never compacts

**Status:** [OK] Resolved (providerId passed to assemble; compactPromptHistory invoked after assemble against the model-aware budget)
**Priority:** high
**Effort:** Medium

## Summary

prepare-generation.ts:90 passes no providerId/tokenBudget -> budget defaults 32000, ignores model context; assemble() never compacts, compactPromptHistory dead. Pass providerId + tokenBudget; add compaction to auto-gen path.

## Evidence

 - bun test src/generation/: 494 pass / 0 fail
 - bun test src/assistant/: 177 pass / 0 fail
 - bunx tsc --noEmit -p tsconfig.backend.json: exit 0

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
