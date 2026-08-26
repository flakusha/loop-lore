# TASK: Outbound fetch HTTP/2 and HTTP/3 protocol hints for providers

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-http-protocol-features

## Summary

Bun 1.4 fetch accepts protocol http2 or http3 (v1.4). The generation module outbound calls to LLM providers can request h2/h3 without affecting inbound WebSocket transport. Add a config-driven protocol hint (default http2, opt-in http3) to the provider fetch client. Independent of the inbound http3 hold (no WS impact). Acceptance: provider fetch path passes the protocol hint when configured; unit test with a local h2/h3-capable mock or stub using unique port/tmp (parallel-safe).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
