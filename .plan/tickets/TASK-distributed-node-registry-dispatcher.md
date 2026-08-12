# TASK: Distributed node registry + dispatcher

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-distributed-compute-sharing

## Summary

Platform hub: node registry (registration, heartbeat/health with timeout eviction, capability index, per-node reputation), task queue + dispatcher (capability-match FIFO + priority + load balance), reschedule on timeout, failover to platform default providers via existing callWithFailover.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
