<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Swarm-vs-leader write-domain partition and cross-topology contract

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-multi-instance-reconciliation

**Summary:**

Resolves BUG-leader-and-swarm-topologies-lack-simultaneous-write-arbitrat: define the write-domain partition rule for when Epic 26 leader reconciliation (epic-multi-instance-reconciliation.md) and swarm CRDT sync (FEAT-swarm-mode-reconciliation) are both active over the same store — which topology wins per domain, arbitration algorithm, conflict surfacing. Add cross-topology interop tests (leader + swarm reconcile same store without corruption) and reference the contract from Epic 26, which currently ignores swarm. AC: partition rule documented in both epics; arbitration unit tests; leader+swarm interop convergence test. Epic: epic-multi-instance-reconciliation.md.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
