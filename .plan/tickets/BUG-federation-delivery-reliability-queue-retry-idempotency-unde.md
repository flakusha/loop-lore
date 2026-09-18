<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Federation delivery reliability (queue, retry, idempotency) undefined

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** not-yet-implemented
**Priority:** medium
**Effort:** Medium

## Summary

FEAT-activitypub-federation does not specify delivery queueing, retries, idempotency for duplicate Create, or dead-letter handling. Robustness gap. Fix: add a delivery pipeline AC with retry and idempotency keys.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
