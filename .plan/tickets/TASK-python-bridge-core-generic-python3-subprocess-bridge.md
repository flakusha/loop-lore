<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Python bridge core: generic python3 subprocess bridge

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Mirror src/blender/bridge.ts for plain python3: probe (PY_CAP marker, version + allowlisted packages), runPythonJob (fixed argv, .py suffix + workdir-allowlist validateJob, JSON over trailing arg), FIFO per-instance lock, sha256 provenance, fail-soft unavailable/timeout/unsupported/malformed union, shell-stub tests (never launch real python). PATH python3 only; no venv yet. Evidence: .tmp/research synthesis in session 2026-11-20 (inventory + mechanics + design slices).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
