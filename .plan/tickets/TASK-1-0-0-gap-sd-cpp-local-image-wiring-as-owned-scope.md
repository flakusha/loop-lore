<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 GAP: sd.cpp local image wiring as owned scope

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

sd.cpp is folded as one task inside epic-local-process-swarm.md (Not Started) with only an e2e fixture leg; no owned wiring scope exists. Scope: llama-swap -> sd.cpp discovery/setup/generation path mirroring the comfyui plugin shape (epic-comfyui-plugin.md, In Progress). Related: epic-local-process-swarm.md, epic-comfyui-plugin.md, .tmp/intercom/RELEASE-1.0.0.md. Caveats: TOCTOU: process discovery snapshot at setup time; concurrent sd.cpp spawn uses locked port. Security: local-process spawn only; no remote code execution. Authorization: setup/generation gated behind user consent for local harness usage. Parallelism: single setup flow; no concurrent discovery races. Partial failure: sd.cpp unavailable falls back to comfyui path. Rollback: additive wiring; removal restores prior local-image behavior. Observability: discovery/setup/generation steps logged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
