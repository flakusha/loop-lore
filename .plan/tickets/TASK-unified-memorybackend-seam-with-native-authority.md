<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Unified MemoryBackend seam with native authority

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

**Summary:** Define the single unified memory interface all backends plug behind: MemoryBackend store/search seam, NativeBackend wrapping existing seams, config memory.backends defaulting to native-only. No behavior change while externals are off. **Context:** Research .tmp/research/harness-memory-unified-backends-2026-11-24.md rev1 sections 1/5 and rev2 sections 4-6. Native chain already implements hard-filter, retrieve, rerank, budget-cap; externals must plug into it. **Scope:** src/memory backend seam file, NativeBackend adapter, config flag, stub-tested, native-only suite green. Out of scope: engram adapter, fan-out writer, fusion reader (separate tickets). **Acceptance:** MemoryBackend interface landed; native adapter delegates to storeMemories, provisionMemories, semanticRecall; flag off equals current behavior byte-for-byte; new tests pass. **Caveats:** Partial failure: interface-only, no fan-out yet so no new failure modes. Rollback: delete seam file, revert config default. Stale state: none, read path untouched. Observability: no new logging surface.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
