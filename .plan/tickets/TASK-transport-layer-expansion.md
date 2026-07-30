# TASK: Transport Layer Expansion

**Status:** 🟡 Partially Built
**Priority:** Medium
**Effort:** High
**Epic:** epic-transport-expansion

## Summary

Modern transport protocols for real-time communication, streaming, and negotiation. HTTP/2 + WebSocket handlers exist; HTTP/3 + WebTransport missing. From `epic-transport-expansion.md`.

## Scope

### Existing (Built)

- HTTP/1.1 handler (`src/transport/http1.ts`)
- HTTP/2 handler
- WebSocket handler

### Missing

- HTTP/3 (QUIC) handler
- WebTransport handler
- Transport negotiation

### Transport Abstraction

- Unified transport interface
- Fallback mechanisms
- Performance monitoring

## Linked Epics

- `epic-transport-expansion.md`

## Acceptance Criteria

- [ ] HTTP/3 (QUIC) handler implemented
- [ ] WebTransport handler implemented
- [ ] Transport negotiation and fallback
- [ ] Unified transport interface
- [ ] Performance monitoring for transport layers
- [ ] Unit tests for transport handlers
- [ ] Integration tests for transport negotiation
- [ ] `bun run check` passes

## Notes

- Reference `epic-transport-expansion.md` for full system design
- HTTP/2 and WebSocket already exist — build on existing patterns
- Consider QUIC library availability for Bun
