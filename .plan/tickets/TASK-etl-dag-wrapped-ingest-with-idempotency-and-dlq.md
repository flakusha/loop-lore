<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ETL DAG-wrapped ingest with idempotency and DLQ

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-rag-ingestion
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-rag-ingestion.md (companions epic-import-export-io, epic-data-integrity-acid). Wrap detect-chunk-embed-redact-load on src/cron/dag engine with idempotency (source,url,hash), ingest_dlq, checkpoints/resume. NOTE: src/rag/pipeline.ts is a NEW file, not existing (verified missing 2026-10-29); do not cite as existing anchor. Caveats: partial-failure resume, DLQ overflow, idempotency races.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
