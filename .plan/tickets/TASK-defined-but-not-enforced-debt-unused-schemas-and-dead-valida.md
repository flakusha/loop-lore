# TASK: Defined-but-not-enforced debt: unused schemas and dead validators

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

19 validation schemas in src/validation/schemas never referenced; validateGeneratedEntity, checkConsistency, validateFeatureFlags, validateProviderUrls, validateDomainConfig, assertRowUpdated, assertRowDeleted exported but never called; config flags in src/config/sections/messages.ts never read. Fix: attach schemas to routes or delete; wire or remove dead validators/config. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
