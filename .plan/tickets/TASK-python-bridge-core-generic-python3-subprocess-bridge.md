<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Python bridge core: generic python3 subprocess bridge

**Status:** In Progress
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Mirror src/blender/bridge.ts for plain python3: probe (PY_CAP marker, version + allowlisted packages), runPythonJob (fixed argv, .py suffix + workdir-allowlist validateJob, JSON over trailing arg), FIFO per-instance lock, sha256 provenance, fail-soft unavailable/timeout/unsupported/malformed union, shell-stub tests (never launch real python). PATH python3 only; no venv yet. Evidence: .tmp/research synthesis in session 2026-11-20 (inventory + mechanics + design slices).

**Context:**

Provenance bug found during DCC research: `runPythonJob` hashes `spec.scriptPath` instead of recipe bytes, so same-path edits keep the old `scriptDigest`, and unreadable recipes spawn before failing. Blender bridge already hashes exact bytes and returns `invalid` for unreadable recipes.

**Acceptance Criteria:**

- [x] Hash recipe bytes read immediately before spawn
- [x] Return `invalid` with `Cannot read recipe:` when unreadable, without spawning
- [ ] Tests passing
- [ ] Documentation updated
