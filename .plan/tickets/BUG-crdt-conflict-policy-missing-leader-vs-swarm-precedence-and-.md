# BUG: CRDT conflict policy missing leader-vs-swarm precedence and deletes

**Status:** not-yet-implemented
**Priority:** medium
**Effort:** Medium

## Summary

FEAT-swarm-mode-reconciliation names LWW for scalar fields, OR-Set for membership or lore, RGA for message bodies, but defines no leader-vs-swarm precedence, no delete or tombstone propagation, and no RGA size bounds. Correctness gap. Fix: extend the conflict policy with delete propagation and cross-topology precedence.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
