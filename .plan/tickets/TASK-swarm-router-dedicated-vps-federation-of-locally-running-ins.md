<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Swarm Router (dedicated VPS) — federation of locally-running instances

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-process-swarm

## Summary

Dedicated VPS router that federates locally-running instances (local swarms) across hosts into a mesh. Consumes epic-federation-swarm-sync / epic-distributed-compute-sharing (network axes) rather than reinventing them. Distinct from the in-host local-swarm-router. Provides cross-host federation resilience; needs its own HA story (network SPOF). See Design 'swarm-router' role + Steps item 4.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
