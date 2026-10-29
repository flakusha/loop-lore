<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: OpenSCAD parametric render via CLI allowlist

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-external-creative-tool-bridge
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-external-creative-tool-bridge.md (3D side epic-3d-generation). Smallest ticket: OpenSCAD parametric render via CLI behind tool allowlist, pure-compute flow only (mesh in, file out). Printer-control actuation deferred until A2 sandbox. Precondition: sandbox-gating rule. Caveats: CLI arg injection, tool-version drift, runaway render cost.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
