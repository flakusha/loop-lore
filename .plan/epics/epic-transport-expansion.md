# EPIC: Transport Layer Expansion (HTTP/2, HTTP/3, WebSocket, WebTransport)

**Status:** 🟡 Partially Built — H2/WS handlers exist but http1/h2 send() are no-op stubs; NOT server-wired; H3/WebTransport missing
**Priority:** Medium
**Effort:** Medium (remaining gaps only)
**Type:** Feature Epic

## Summary

Modern transport protocols for real-time communication, streaming, and negotiation.
A transport abstraction already exists in `src/transport/` (`TransportBase` + per-protocol
handlers, server-side negotiation, connection upgrade, and compression). This epic scopes the
**genuinely missing** pieces (HTTP/3/QUIC, WebTransport) and the wiring gaps that remain before
the existing handlers are server-reachable.

## Current State Re-Survey (2026-07-20)

| Area               | File(s)                                 | State      | Notes                                                                                                                    |
| ------------------ | --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| HTTP/1.1 handler   | `src/transport/http1.ts`                | ✅ Built   | `Http1Handler` — keep-alive, idle timeout.                                                                               |
| HTTP/2 handler     | `src/transport/h2.ts`                   | ✅ Built   | `H2Handler` — multiplexing, server-push metadata, stream tracking, close().                                              |
| WebSocket handler  | `src/transport/ws.ts`                   | ✅ Built   | `WsHandler` — ping/pending-queue, connection lifecycle.                                                                  |
| Negotiation        | `src/transport/negotiation.ts`          | ✅ Built   | Server capabilities + `negotiate()`; **default capability list advertises HTTP/1.1 only** (gap — H2/WS not yet offered). |
| Upgrade            | `src/transport/upgrade.ts`              | ✅ Built   | Graceful protocol upgrade with fallback.                                                                                 |
| Compression        | `src/transport/compression.ts`          | ✅ Built   | gzip/zstd/brotli wrappers + `withCompression`.                                                                           |
| Factory / barrel   | `src/transport/factory.ts`, `index.ts`  | ✅ Built   | `createProtocol()` dispatcher; exports all handlers.                                                                     |
| Test harness       | `src/transport/test/harness.ts`         | ✅ Built   | `buildDefaultTests`, `validateProtocol`, `TestReport`.                                                                   |
| HTTP/3 (QUIC)      | —                                       | ❌ Missing | No QUIC handler, no `TransportProtocol.Http3` enum usage.                                                                |
| WebTransport       | —                                       | ❌ Missing | No WebTransport handler, no `TransportProtocol.WebTransport` enum usage.                                                 |
| Server-side wiring | `src/server.ts`, `src/config/schema.ts` | ❌ Gap     | Existing H2/WS handlers are not yet advertised/served by the HTTP server (negotiation defaults to 1.1).                  |

## Scope

- HTTP/3 (QUIC) handler + enum + negotiation entry
- WebTransport handler + enum + negotiation entry
- Server-side wiring so H2/WS are actually offered (extend `DEFAULT_CAPABILITIES`, hook into `src/server.ts`)
- Streaming optimization on top of existing handlers

## Tasks

- [x] HTTP/1.1 handler (`src/transport/http1.ts`)
- [x] HTTP/2 handler (`src/transport/h2.ts`) — multiplexing, server push metadata
- [x] WebSocket handler (`src/transport/ws.ts`) — lifecycle, ping, pending queue
- [x] Transport negotiation logic (`src/transport/negotiation.ts`)
- [x] Connection upgrade (`src/transport/upgrade.ts`)
- [x] Compression wrappers (`src/transport/compression.ts`)
- [ ] Server-side wiring: advertise + serve H2/WS (extend `DEFAULT_CAPABILITIES`, `src/server.ts`)
- [ ] HTTP/3 (QUIC) support — handler + `TransportProtocol.Http3` + negotiation
- [ ] WebTransport endpoint — handler + `TransportProtocol.WebTransport` + negotiation
- [ ] Streaming optimization on existing handlers

## Files

- `src/transport/` — transport layer (handlers, negotiation, upgrade, compression, factory)
- `src/server.ts` — server configuration (wiring gap)
- `src/config/schema.ts` — transport config
- `src/db/enums.ts` — `TransportProtocol` enum (extend for Http3/WebTransport)

## Related Epics

- **Epic Platform Research & Feature Adoption** — tracks adoption of modern transport standards; consult before adding QUIC/WebTransport.
- **Epic Code Quality & Best Practices** — transport test harness should satisfy the type-coverage / complexity gates.

## Scope Boundary

- **IN:** new protocol handlers (H3/WebTransport), server wiring for existing H2/WS, stream optimization.
- **OUT:** application-level real-time features (SSE in `src/routes/activity-stream.ts`); general lint/format (Epic Code Quality).

## Linked Tasks

- TASK-transport-expansion.md
- TASK-transport-server-wiring.md

## Wiring & Resolution Plan (2026-08-08 audit)

`src/transport/` has ZERO external importers outside itself. `ws.ts` send() is real, but
`http1.ts` (lines 25-28) and `h2.ts` (lines 28-31) send() are silent no-op stubs, and the server
does not advertise H2/WS (`DEFAULT_CAPABILITIES` in `negotiation.ts` offers HTTP/1.1 only).
Resolution: implement real send() for http1/h2, advertise H2/WS in `DEFAULT_CAPABILITIES`, and
hook the transport into the server — tracked by `TASK-transport-server-wiring`. HTTP/3 +
WebTransport remain separate existing tasks.
