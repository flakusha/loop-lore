<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: grade-gated-memory-discovery

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

High-grade (>=threshold, dryRun first) results become candidate facts via extraction with sourceGradeId provenance; low-grade soft-invalidates derived memories; all behind human-approved prompt-version gate. Owner epic: epic-memory-knowledge-systems. Anchors: src/memory/extraction.ts; src/memory/injection/select.ts (qualityWeight rerank touchpoint); src/memory/purge.ts + audit.ts (soft-invalidation); src/chat/service/carry-memory.ts. Refs: https://www.trulens.org (RAG triad grounding); https://docs.ragas.io (faithfulness metrics). Acceptance: dryRun candidate facts with provenance; low-grade soft-invalidation; prompt-version gate. Coordinate with memory-txn ticket boundaries, do not duplicate. Source: internet-expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
