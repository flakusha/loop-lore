<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Defined-but-not-enforced debt: unused schemas and dead validators

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** medium
**Effort:** Medium

## Summary

19 validation schemas in src/validation/schemas never referenced; validateGeneratedEntity, checkConsistency, validateFeatureFlags, validateProviderUrls, validateDomainConfig, assertRowUpdated, assertRowDeleted exported but never called; config flags in src/config/sections/messages.ts never read. Fix: attach schemas to routes or delete; wire or remove dead validators/config. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
