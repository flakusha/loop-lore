<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Federated delete and GDPR right-to-be-forgotten unhandled

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** medium
**Effort:** Medium

## Summary

No federation ticket specifies Delete activity propagation or right-to-be-forgotten across replicas. Legal gap. Fix: add AC for outbound Delete propagation and inbound Delete handling across federated copies.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-05 registry-driven close: git issue 32066c5 (registry tip: deadc8d8b Konstantin Fedotov Close issue)
