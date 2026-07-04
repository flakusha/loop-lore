# Unified Transport Abstraction

## Overview

Single interface for HTTP/HTTPS/WebSocket/WebTransport with pluggable compression and protocol negotiation.

> **Status:** Implemented. See `src/transport/` for source.

---

## Core Interface — `src/transport/protocol.unified.ts`

`ProtocolHandler` — connect/send/get/close lifecycle.

`Connection` — id, protocol, remoteAddr, metadata.

---

## Factory — `src/transport/factory.ts`

`createProtocol(config)` — creates handler based on config protocol.

**Selection priority:**
1. Explicit config `protocol`
2. `Accept` header negotiation
3. ALPN (TLS)
4. Fallback: `http/1.1`

---

## Built-in Adapters

| Protocol | File | Features |
|----------|------|----------|
| HTTP/1.1 | `http1.ts` | Baseline, keep-alive |
| HTTP/2 | `h2.ts` | Multiplexing, server push |
| WebSocket | `ws.ts` | Binary/text frames, ping/pong |

Each adapter wraps native Bun APIs (`serve`, `WebSocket`).

> **Not yet implemented:** HTTP/3 (`h3.ts`), WebTransport (`wt.ts`). Planned as future extensions.

---

## Compression Layer — `src/transport/compression.ts`

`withCompression(handler, algorithm, options?)` — decorator pattern wrapping ProtocolHandler.

- Applied transparently to `send()` / incoming data
- Negotiated via `Accept-Encoding` / `Content-Encoding`
- Configurable per-connection or global

---

## Protocol Negotiation — `src/transport/negotiation.ts`

`negotiate(request, serverCaps)` — parses Accept/Accept-Encoding headers, selects best protocol+compression.

**Capabilities advertised:**
- `maxFrameSize`: default `0x10000` (64 KiB)
- `maxPayload`: default `0x50000` (320 KiB)
- `extensions`: `['compression/zstd', 'compression/br', 'handshake/v1']`

---

## Migration / Upgrade Path — `src/transport/upgrade.ts`

`upgradeConnection(current, targetProtocol, config)` — validates upgrade paths, transfers state, closes old handler.

- Graceful handoff: drain in-flight, re-establish
- State transferred via `Connection.metadata`
- Automatic fallback on failure

---

## Testing Harness — `src/transport/test/harness.ts`

`validateProtocol(handler, tests)` — runs test suite against a handler.

`buildDefaultTests()` — returns no-op defaults for smoke testing.

---

## Integration Points

| Layer | Entry Point |
|-------|-------------|
| Server (HTTP/HTTPS) | `src/server.ts` → `createProtocol({ protocol: 'http/1.1' })` |
| WebSocket | `src/server.ts` → upgrade handler → `createProtocol({ protocol: 'websocket' })` |
| WebTransport | `src/server.ts` → WT endpoint → `createProtocol({ protocol: 'webtransport' })` |
| Client (TUI) | `src/tui/app.ts` → `createProtocol({ protocol: 'websocket' })` |
| Client (Web) | Static JS → `new WebSocket()` / `new WebTransport()` |

---

## Configuration — `src/config/schema.ts`

`TransportConfig` in config schema:
- `defaultProtocol`, `enableWebSocket`, `enableWebTransport`, `enableH2`, `enableH3`
- `compression` (enabled, default algorithm, threshold)
- `limits` (maxFrameSize, maxPayload, maxConcurrentStreams)

Env overrides in `src/config/load.ts` — 12 `TRANSPORT_*` vars.

---

## Error Handling — `src/transport/errors.ts`

`TransportError` extends Error with `code`, `recoverable`, `cause`.

Codes: `PROTOCOL_UNSUPPORTED`, `NEGOTIATION_FAILED`, `COMPRESSION_FAILED`, `UPGRADE_FAILED`, `CONNECTION_CLOSED`, `BACKPRESSURE_TIMEOUT`, `MAX_FRAME_EXCEEDED`.

---

## Future Extensions

- QUIC native (when Bun stabilizes)
- HTTP/3 prioritization
- WebTransport bidirectional streams
- Custom protocol plugins via `ProtocolHandler` impl
