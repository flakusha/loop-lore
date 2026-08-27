# BUG: Leader and swarm topologies lack simultaneous-write arbitration

**Status:** not-yet-implemented
**Priority:** high
**Effort:** Medium

## Summary

The federation epic says the same store reconciles via different topologies; FEAT-swarm-mode-reconciliation AC asserts no corruption but defines no rule when leader-based and swarm-mode are both active. Correctness gap. Fix: partition write domains so swarm CRDT owns chat or lore or membership (conflict-free) and leader owns schema or migration DDL; specify non-overlapping surfaces so the two never contend on the same row class.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
