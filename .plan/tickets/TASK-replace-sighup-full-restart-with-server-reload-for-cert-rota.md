# TASK: Replace SIGHUP full restart with server.reload for cert rotation

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-http-protocol-features

## Summary

On SIGHUP src/server/start.ts does a full shutdown plus restart, dropping all live WebSocket/transport connections. Bun server.reload reloads config/certs with zero downtime and no dropped connections. Wire SIGHUP and the key-rotation path to server.reload on both HTTP and HTTPS servers. References epic-certificate-and-tls-management (Certificate lifecycle and health). Acceptance: SIGHUP reloads certs without closing established WS; test verifies a held WS stays open across reload (parallel-safe: unique port, deterministic teardown).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
