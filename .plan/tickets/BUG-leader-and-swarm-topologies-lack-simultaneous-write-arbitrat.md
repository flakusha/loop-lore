<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Leader and swarm topologies lack simultaneous-write arbitration

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** not-yet-implemented
**Priority:** high
**Effort:** Medium

## Summary

The federation epic says the same store reconciles via different topologies; FEAT-swarm-mode-reconciliation AC asserts no corruption but defines no rule when leader-based and swarm-mode are both active. Correctness gap. Fix: partition write domains so swarm CRDT owns chat or lore or membership (conflict-free) and leader owns schema or migration DDL; specify non-overlapping surfaces so the two never contend on the same row class.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
