<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Model hash blake3 and sha256 with cross-model dedup

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-model-metadata-read
**Tags:** models, hashing, dedup

**Summary:**

Streamed model-file hashing: blake3 (parallel/memory-mapped preferred) for identity + dedup, sha256 kept for remote-API compat (civitai-style). Hashes join the model index with set-based dedupe so the same file under two categories/paths is recognized once; hash sets double as skip-lists during rescans.

Reference: Stability Matrix StabilityMatrix.Core/Helper/FileHash.cs (GetBlake3Async, GetBlake3Parallel, GetBlake3MemoryMappedParallel, GetSha256Async); ModelIndexService.cs ModelIndexBlake3Hashes/ModelIndexSha256Hashes sets; existing native loader src/native/blake3.ts + fallback.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
