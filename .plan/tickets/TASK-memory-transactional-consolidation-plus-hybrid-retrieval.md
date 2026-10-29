<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: memory transactional consolidation plus hybrid retrieval

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-memory-knowledge-systems
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-memory-knowledge-systems.md. Fix-first: transactional extraction writes, orphaned-embedding and NaN guards. NOTE: src/memory/shadow-recall.ts is a NEW file, not existing (verified missing 2026-10-29); file the STALE reference or dead code accordingly. Then hybrid plus MMR, domain filter, carry-forward prefs. Defer Ebbinghaus formalization, graph-DB, multimodal memory. Caveats: migration locking, decay misfire deleting live memories.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
