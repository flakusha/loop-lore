# BUG: computeContextWindow phase-3 trims newest instead of oldest

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

context-window.ts:102 keeps oldest, drops newest on overflow. Latent (handlers uses only totalTokens). Fix trim order; verify pruning reuse of retained.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
