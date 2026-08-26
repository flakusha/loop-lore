# TASK: Implement BUG-nsfw-reviewappeal-auto-reverses-actions

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Two-phase reversal: reviewAppeal(approved) records pending_reversal; new executeReversal(appealId) requires admin.users and a different admin to apply; superseded_by column; notify original moderator; carry reviewNote; audit both events.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
