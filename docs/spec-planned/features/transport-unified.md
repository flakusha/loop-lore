# Unified Transport Abstraction

Single interface for HTTP/HTTPS/WebSocket/WebTransport with pluggable compression and protocol negotiation.

**Status:** Implemented. See `src/transport/`.

---

## Core Interface — `src/transport/protocol.unified.ts`

`ProtocolHandler` — connect/send/get/close lifecycle.
`Connection` — id, protocol, remoteAddr, metadata.

## Factory — `src/transport/factory.ts`

`createProtocol(config)` — handler based on config protocol.
Selection: explicit config → `Accept` header → ALPN (TLS) → http/1.1 fallback.

## Built-in Adapters

| Protocol  | File       | Features                      |
| --------- | ---------- | ----------------------------- |
| HTTP/1.1  | `http1.ts` | Baseline, keep-alive          |
| HTTP/2    | `h2.ts`    | Multiplexing, server push     |
| WebSocket | `ws.ts`    | Binary/text frames, ping/pong |

Not yet implemented: HTTP/3 (`h3.ts`), WebTransport (`wt.ts`).

## Compression — `src/transport/compression.ts`

`withCompression(handler, algorithm, options?)` — decorator wrapping ProtocolHandler.
Applied to `send()` / incoming data. Negotiated via `Accept-Encoding` / `Content-Encoding`.

## Protocol Negotiation — `src/transport/negotiation.ts`

`negotiate(request, serverCaps)` — parses Accept/Accept-Encoding headers, selects best.
Capabilities: `maxFrameSize` (default 64 KiB), `maxPayload` (320 KiB), `extensions: ['compression/zstd', 'compression/br', 'handshake/v1']`.

## Upgrade — `src/transport/upgrade.ts`

`upgradeConnection(current, targetProtocol, config)` — validates upgrade paths, transfers state via `Connection.metadata`, graceful handoff with automatic fallback.

## Testing — `src/transport/test/harness.ts`

`validateProtocol(handler, tests)` — suite runner. `buildDefaultTests()` — smoke defaults.

## Integration Points

| Layer               | Entry Point                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| Server (HTTP/HTTPS) | `src/server.ts` → `createProtocol({ protocol: 'http/1.1' })`            |
| WebSocket           | `src/server.ts` → upgrade → `createProtocol({ protocol: 'websocket' })` |
| WebTransport        | `src/server.ts` → WT endpoint                                           |
| Client (TUI)        | `src/tui/app.ts` → `createProtocol({ protocol: 'websocket' })`          |
| Client (Web)        | Static JS → `new WebSocket()` / `new WebTransport()`                    |

## Config — `src/config/schema.ts`

`TransportConfig`: `defaultProtocol`, `enableWebSocket`, `enableWebTransport`, `enableH2`, `enableH3`, `compression` (enabled, default algo, threshold), `limits` (maxFrameSize, maxPayload, maxConcurrentStreams).

Env overrides: 12 `TRANSPORT_*` vars.

## Error Handling — `src/transport/errors.ts`

`TransportError` extends Error with `code`, `recoverable`, `cause`.

Codes: `PROTOCOL_UNSUPPORTED`, `NEGOTIATION_FAILED`, `COMPRESSION_FAILED`, `UPGRADE_FAILED`, `CONNECTION_CLOSED`, `BACKPRESSURE_TIMEOUT`, `MAX_FRAME_EXCEEDED`.

## Future

QUIC native (when Bun stabilizes), HTTP/3 prioritization, WebTransport bidirectional streams, custom protocol plugins.
