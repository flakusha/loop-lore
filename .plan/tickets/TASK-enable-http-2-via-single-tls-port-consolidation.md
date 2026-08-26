# TASK: Enable HTTP/2 via single-TLS-port consolidation

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-http-protocol-features

## Summary

Today src/server/start.ts runs two Bun.serve instances: plaintext HTTP on config.server.port and TLS on port+443. Bun negotiates HTTP/2 automatically when tls is set (ALPN h2/h1.1; Bun v1.3.14). Because the main app port is plaintext, clients never get h2, forfeiting multiplexed static assets and concurrent SSE the Web UI needs. Consolidate to ONE TLS server on the standard port (ALPN yields h1.1+h2), redirect plaintext to TLS, and delete the port+443 second server. References epic-certificate-and-tls-management (Production TLS configuration). Acceptance: app served over h2 on the TLS port; h1.1 clients still work; plaintext redirected; no dual-server; test asserts h2 via ALPN using port 0 and deterministic teardown (parallel-safe).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
