<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Federation delivery reliability (queue, retry, idempotency) undefined

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-federation-offload-quotas

## Summary

FEAT-activitypub-federation does not specify delivery queueing, retries, idempotency for duplicate Create, or dead-letter handling. Robustness gap. Fix: add a delivery pipeline AC with retry and idempotency keys.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue d07462c (registry tip: 24445fa7e Konstantin Fedotov Close issue)
