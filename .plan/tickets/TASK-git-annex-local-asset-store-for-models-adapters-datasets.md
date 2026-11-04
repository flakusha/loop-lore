<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: git-annex local asset store for models adapters datasets

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Model weights (GGUF/ONNX), LoRA adapters, voice clips, dataset dirs are the annex shape: large, checksummed, partially present. Scope: annex-backed local store with numcopies/drop policy, per-file backend choice, offline-capable; wire into existing LoRA discovery + model catalog. No LFS server. Research: .tmp/research/harness-git-integration-2026-11-03.md sections 2+5.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
