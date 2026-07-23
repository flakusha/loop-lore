# TASK: EPIC: Transport Layer Expansion (HTTP/2, HTTP/3, WebSocket, WebTransport)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium (remaining gaps only)
**Epic:** epic-transport-expansion

## Summary

Modern transport protocols for real-time communication, streaming, and negotiation.
A transport abstraction already exists in `src/transport/` (`TransportBase` + per-protocol
handlers, server-side negotiation, connection upgrade, and compression). This epic scopes the
**genuinely missing** pieces (HTTP/3/QUIC, WebTransport) and the wiring gaps that remain before
the existing handlers are server-reachable.

## Linked Epics

- `epic-transport-expansion.md`

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
