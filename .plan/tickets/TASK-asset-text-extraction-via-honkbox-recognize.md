<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Asset text extraction via honkbox recognize

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-rag-ingestion
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: QR always, OCR when flagged; stub payload never persisted to real assets. AC: uncompiled backend keeps current no-op behavior. Note: may overlap in-flight slice D in tree honkbox-coverage-2026-11-24; close as duplicate if landed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
