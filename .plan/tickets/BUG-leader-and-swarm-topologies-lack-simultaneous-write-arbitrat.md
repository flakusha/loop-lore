<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Leader and swarm topologies lack simultaneous-write arbitration

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-multi-instance-reconciliation

## Summary

The federation epic says the same store reconciles via different topologies; FEAT-swarm-mode-reconciliation AC asserts no corruption but defines no rule when leader-based and swarm-mode are both active. Correctness gap. Fix: partition write domains so swarm CRDT owns chat or lore or membership (conflict-free) and leader owns schema or migration DDL; specify non-overlapping surfaces so the two never contend on the same row class.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue b760e48 (registry tip: 7a37741a6 Konstantin Fedotov Close issue)
