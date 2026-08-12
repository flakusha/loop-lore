# TASK: Distributed compute node agent

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-distributed-compute-sharing

## Summary

Contributor-side node agent (native daemon + browser/WASM client): register with platform, advertise capabilities (GPU model/VRAM, CPU cores, RAM), heartbeat, pull task/execute/return result, auto-pause (idle/battery/manual); sandboxed execution with no access to platform secrets.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
