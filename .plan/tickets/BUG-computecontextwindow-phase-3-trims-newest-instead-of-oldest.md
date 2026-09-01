<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: computeContextWindow phase-3 trims newest instead of oldest

**Status:** ✅ Done
**Priority:** low
**Effort:** Medium

## Summary

context-window.ts:102 keeps oldest, drops newest on overflow. Latent (handlers uses only totalTokens). Fix trim order; verify pruning reuse of retained.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (N/A — no public docs reference the trim order)
