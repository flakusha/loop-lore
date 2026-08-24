# TASK: Generation maxTokens and prompt array unvalidated (cost/DoS)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/generation/generate-route/handler.ts:90-200 passes input.maxTokens to provider unvalidated and build-prompt.ts:26 returns prompt array verbatim with no size limit. Fix: clamp maxTokens to model cap; cap prompt length/bytes server-side. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
