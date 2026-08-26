# TASK: Hold inbound HTTP/3 until Bun supports WebSocket over H3

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-http-protocol-features

## Summary

Bun 1.4 http3:true plus tls enables HTTP/3 on the same port, but WebSocket over HTTP/3 is unsupported (server.upgrade returns false; Bun v1.3.14 limitations). loop-lores WebSocket transport (src/transport/ws.ts) would break for clients that negotiate h3 then open wss. Bun binds h3 for the whole port and cannot scope per route. Do NOT enable inbound http3 in production yet; track Bun releases for WS-over-H3. References epic-realtime-transports. Acceptance: inbound http3 stays off; a tracked note records the unblock criterion (Bun WS-over-H3 support).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
