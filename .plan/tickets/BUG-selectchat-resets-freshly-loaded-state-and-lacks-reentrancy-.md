# BUG: selectChat resets freshly loaded state and lacks reentrancy guard

**Status:** ✅ Resolved (2026-08-25, worktree `bugfix-medium-low`, commit 04411f8)
**Priority:** medium
**Effort:** Medium

## Summary

src/frontend/alpine/chat/world.ts:90-122: _sections/_background/_locations reset AFTER first loadSections() resolves (L92 vs L112) — wipes fresh state then reloads at L121. No reentrancy guard: overlapping selectChat calls interleave loads, last-writer-wins per resource -> mixed-chat state possible.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
