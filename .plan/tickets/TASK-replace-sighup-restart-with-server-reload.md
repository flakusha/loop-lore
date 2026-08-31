# TASK: Replace sighup restart with server reload

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-http-protocol-features.md

## Summary

Use `server.reload()` for cert/key rotation without dropped sockets, replacing SIGHUP full restart.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
