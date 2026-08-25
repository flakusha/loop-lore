# BUG: resolveFlagBody schema allows upheld but service type expects confirmed — status mismatch

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-nsfw-moderation-priority

## Summary

shared.ts:109-125 resolveFlagBody schema uses status enum with 'upheld' (and 'rejected', 'dismissed'). types.ts NsfwModerationService interface expects status type 'confirmed' (not 'upheld') for resolved statuses. This mismatch means the API accepts a status the service type does not expect — either a type error at call sites or a runtime branch that never fires. Pre-existing (not introduced 2026-08-25) but surfaced during review. Fix: align schema enum with service type.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
