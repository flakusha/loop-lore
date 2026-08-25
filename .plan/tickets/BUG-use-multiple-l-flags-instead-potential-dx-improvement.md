# BUG: use multiple -l flags instead - potential DX improvement

**Status:** 🚫 Invalid premise (verified 2026-08-25)
**Priority:** low
**Effort:** Medium

## Summary

DX improvement: where a single label flag is accepted, support repeated -l flags (e.g. -l a -l b) instead of comma-separated or single-value parsing. Aligns with common CLI conventions and improves usability.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Verification

scripts/worktree/commands/ticket.ts already accepts repeated --label flags: labels array initialized empty, pushed per occurrence, applied per label via git issue edit -l. Premise does not hold for this codebase.
