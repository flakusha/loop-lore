# TASK: Local Swarm Router — in-host process manage/filter/balance

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-process-swarm

## Summary

Dedicated in-host routing process (microservice-inside-microservice) for epic-local-process-swarm. Manages, filters, and load-balances the local swarm processes (core + workers) on one host; single entry in front of core+workers; dispatches inbound requests/units-of-work by role/health/capacity. Resolves internal automatic routing between local instances. Reports per-role request queue depth / latency to the supervisor for allocPolicy scale-up. See Design 'local-swarm-router' role + Steps item 3.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
