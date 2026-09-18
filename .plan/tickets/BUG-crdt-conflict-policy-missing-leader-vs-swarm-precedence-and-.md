<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: CRDT conflict policy missing leader-vs-swarm precedence and deletes

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 🚫 Closed — stale-premature (verified 2026-09-18)

## Rationale

The conflict policy this ticket asks to extend lives in `FEAT-swarm-mode-reconciliation` (status: undefined in `.plan/index.json`). That FEAT defines the LWW/OR-Set/RGA conflict policy and the leader-vs-swarm topology split; both `epic-federation-swarm-sync.md` and `BUG-leader-and-swarm-topologies-lack-simultaneous-write-arbitrat.md` defer to it. No CRDT code exists in `src/` (no `swarm-mode`/`crdt`/`cr-sqlite` matches); no `conflictPolicy` module exists. Extending a policy that does not yet exist is a contradiction. Re-open when `FEAT-swarm-mode-reconciliation` lands (after `epic-multi-instance-reconciliation` leader path is stable per matrix-federation-swarm.md).
**Priority:** medium
**Effort:** Medium

## Summary

FEAT-swarm-mode-reconciliation names LWW for scalar fields, OR-Set for membership or lore, RGA for message bodies, but defines no leader-vs-swarm precedence, no delete or tombstone propagation, and no RGA size bounds. Correctness gap. Fix: extend the conflict policy with delete propagation and cross-topology precedence.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
