<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Unified memory writer with native-first best-effort fan-out

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

**Summary:** UnifiedWriter persists native first as authority, then fans out to each enabled backend in parallel under one shared timeout; backend failure writes an audit row and never blocks commit, mirroring harness-recall best-effort storeHarnessRunSummary. **Context:** Research rev2 section 6. Disabled backend is zero code path via early return. **Scope:** Writer module, audit rows on backend failure, tests for native-first ordering and failure non-blocking. Out of scope: fusion reader, new adapters. **Acceptance:** Native persists before any external call; one backend failing leaves commit green plus audit row; all-disabled equals current behavior; tests pass. **Caveats:** Partial failure: the core hazard, handled by audit-row plus green commit. Rollback: revert writer, callers keep direct native path until switched. Stale state: failed backend may lag native; recency plus provenance resolves on read. Data races: parallel fan-out is per-backend independent, no shared mutable state. Idempotency: native storeMemories dedup unchanged; backend retries are adapter-local. Observability: per-backend outcome in audit row.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
