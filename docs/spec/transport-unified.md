> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.
> This document is the **design spec** for the unified transport layer. Where the
> text says "implemented" it reflects `src/transport/` as of 2026-07-20; items marked
> **[GAP]** are documented intent not yet backed by working code. See
> `.plan/epics/epic-transport-expansion.md` for the implementation epic and task issues.

# Unified Transport Abstraction

Single interface for HTTP/1.1, HTTP/2, HTTP/3, WebSocket, Server-Sent Events, and
WebTransport, with pluggable compression and protocol negotiation. The goal is one
`ProtocolHandler` contract so the rest of the app (server routes, TUI client, web
client, future federation/plugin transports) never branches on the wire protocol.

**Status:** Partial. HTTP/1.1 + WebSocket are functional; HTTP/2 is stubbed; HTTP/3,
WebTransport, and SSE are not yet implemented. See `src/transport/`.

---

## Core Interface — `src/transport/protocol.unified.ts`

`ProtocolHandler` — connect / send / get / close lifecycle.

- `connect()` — establish; resolves with a `Connection`.
- `send(data)` — `string` = text frame, `Uint8Array` = binary frame.
- `get(signature)` — retrieve a negotiated capability (e.g. remote signature / agreed limits).
- `close()` — graceful drain then teardown.

`Connection` — `id`, `protocol`, `remoteAddr`, `metadata` (state bag used by upgrade handoff).

`ProtocolEvents` — optional emitter shape: `open`, `message`, `error`, `close`. Adapters
implement this so the rest of the app can subscribe uniformly regardless of protocol.

**Design rule:** every adapter extends `TransportBase` (`base.ts`) so connect/close/metadata
boilerplate is shared; only the wire-specific `send()` and protocol metadata differ.

## Factory — `src/transport/factory.ts`

`createProtocol(config)` — dispatches to the right adapter.

Selection priority (already-negotiated → explicit):
1. `config.protocol` (post-negotiation result)
2. `Accept` header (see Negotiation)
3. ALPN (TLS) — handled by the server socket layer, surfaced into `config`
4. `http/1.1` fallback

Unknown / unimplemented protocols throw `TransportError(ProtocolUnsupported)`. The
compression wrapper (`withCompression`) is applied here when `config.compression != none`.

## Built-in Adapters

| Protocol  | File       | State        | Features                                            |
| --------- | ---------- | ------------ | --------------------------------------------------- |
| HTTP/1.1  | `http1.ts` | ✅ Functional | keep-alive, idle timeout                            |
| HTTP/2    | `h2.ts`    | ⚠️ Stub      | metadata claims multiplexing/server-push; `send()` is a no-op — **[GAP]** not server-wired |
| WebSocket | `ws.ts`    | ✅ Functional | binary/text frames, ping/pong, pending-queue, `attach()` for server-side |
| SSE       | —          | ❌ Missing    | **[GAP]** not in `TransportProtocol` enum; see SSE section |
| HTTP/3    | —          | ❌ Missing    | **[GAP]** enum present, no handler (QUIC)           |
| WebTransport | —       | ❌ Missing    | **[GAP]** enum present, no handler                  |

> **Reconcile note:** `epic-transport-expansion.md` marks `h2.ts` as "Built". The handler
> class exists but `send()` does not transmit; treat HTTP/2 as stubbed until server wiring
> lands. Do not advertise H2 as production-ready.

---

## Protocol Deep Dives

### HTTP/1.1 — `http1.ts`
Baseline request/response. Keep-alive + idle timeout. Used for all standard REST routes
(`docs/spec/api-routes.md`) and static asset serving. No multiplexing — one request per
connection; the server relies on connection pooling. Sufficient for the current htmx/Alpine
web UI where each interaction is a discrete request.

### HTTP/2 — `h2.ts` **[GAP: stub]**
Multiplexed streams over one TCP connection; removes head-of-line blocking; server push for
proactive asset delivery.

**Why it matters here:**
- **Asset pipeline** (`docs/spec/assets.md`) — push referenced images/audio alongside a chat
  page load instead of waiting for the client to discover and request them.
- **Parallel generation** — fan out multiple LLM provider calls (or multi-LLM story turns,
  `docs/frontend/chat/multi-llm-story.md`) over separate streams without connection contention.
- **Header compression (HPACK)** — cuts overhead on the many small authenticated requests the
  web UI makes.

**Work remaining:** real Bun HTTP/2 server wiring, stream lifecycle in `send()`, server-push
hook, and advertising H2 in `DEFAULT_CAPABILITIES`.

### HTTP/3 / QUIC **[GAP: missing]**
UDP-based, 0-RTT resumption, independent streams (no HOL blocking even at packet level),
built-in encryption. Depends on Bun gaining stable QUIC listeners.

**Why it matters here:**
- **Low-latency mobile / offline-first PWA** (`docs/ideas/platform-reach.md` #23) — reconnect
  after sleep without TCP handshake penalty; resilient on flaky cellular.
- **Cross-device E2E sync** (#25) — faster resume of encrypted sync streams across networks.

Fallback chain: HTTP/3 → HTTP/2 → HTTP/1.1, selected via ALPN then header negotiation.

### WebSocket — `ws.ts`
Full-duplex, message-oriented. Real client + `attach()` for server-side upgrade. Ping/pong
keepalive, pending-message queue while connecting.

**Why it matters here:**
- **TUI client** (`src/tui/app.ts`) — persistent connection for live chat, no polling.
- **Real-time chat** — streaming generation tokens, typing indicators, presence.
- **E2E-encrypted payloads** (`docs/spec/crypto.md`) — binary framing carries ciphertext;
  the transport is payload-agnostic so encryption stays above the wire layer.

**Work remaining:** documented reconnect/backoff policy, binary sub-protocol negotiation for
encrypted frames, and server advertisement.

### Server-Sent Events (SSE) **[GAP: missing — enum + handler]**
Unidirectional server→client streaming over plain HTTP/1.1 or HTTP/2. Simpler than WebSocket
when the client never needs to send on the same channel.

**Why it matters here:**
- **Generation streaming** (`docs/frontend/chat/generation.md`) — token-by-token typing
  indicator without a full WS upgrade; the web UI can subscribe via `EventSource`.
- **Notifications** (`docs/frontend/notifications.md`) — server-pushed toasts, moderation
  alerts, async NPC mail delivery (#22) without holding a WS connection.
- **Presence/typing** in group chat (#19 co-authoring) where only downstream updates are needed.

**Required change:** add `Sse: "sse"` to `TransportProtocol` (`src/db/enums-config.ts`) and a
`src/transport/sse.ts` adapter implementing `ProtocolHandler` with `send()` = `text/event-stream`
chunk emission. Negotiated via `Accept: text/event-stream`.

### WebTransport **[GAP: missing]**
Bidirectional streams + unreliable datagrams over QUIC. Superset of WS (multiple streams,
out-of-order datagrams) without TCP HOL blocking.

**Why it matters here:**
- **Real-time co-authoring** (#19) — separate streams per collaborator cursor/typing without
  head-of-line blocking.
- **Group chat** (`docs/frontend/chat/group-chat.md`) — per-participant streams, initiative
  tracking updates as low-latency datagrams.
- **Notifications at scale** — datagram channel for high-frequency, lossy updates.

Fallback: WebTransport → WebSocket → SSE → HTTP/1.1 polling.

---

## Compression — `src/transport/compression.ts`

`withCompression(handler, algorithm, options?)` — decorator over `ProtocolHandler`. Wraps
`send()` and incoming data. Negotiated via `Accept-Encoding` / `Content-Encoding`.

Algorithms: `zstd` (preferred), `brotli` (`br`), `gzip`, `none`. Threshold option avoids
compressing tiny frames. Applies uniformly across all adapters, so HTTP/2 push, WS frames,
and SSE chunks all benefit without per-protocol code.

## Protocol Negotiation — `src/transport/negotiation.ts`

`negotiate(request, serverCaps)` — parses `Accept` (protocols), `Accept-Encoding`
(compression), and `sec-websocket-extensions` (extensions); returns `NegotiationResult`
(protocol, compression, extensions, limits).

`DEFAULT_CAPABILITIES` currently advertises **HTTP/1.1 only** — **[GAP]** must extend to
offer H2/WS/SSE once their handlers are real, else clients can never select them.

Capabilities: `maxFrameSize` (64 KiB default), `maxPayload` (320 KiB), `extensions`
(`compression/zstd`, `compression/br`, `handshake/v1`).

### Negotiation & Upgrade Matrix

| From ↓ / To → | HTTP/1.1 | HTTP/2 | WebSocket | SSE | WebTransport |
| ------------- | -------- | ------ | --------- | --- | ------------ |
| HTTP/1.1      | —        | ALPN   | `Upgrade` | `Accept: text/event-stream` | HTTP/3+ ALPN |
| HTTP/2        | ALPN     | —      | `Upgrade` over h2 | native stream | ALPN |
| WebSocket     | fallback | —      | —         | n/a | `Upgrade` to WT |
| SSE           | native   | native | n/a       | —   | n/a |
| WebTransport  | fallback | —      | fallback   | n/a  | —            |

Priority: explicit config → `Accept` → ALPN → fallback. `upgradeConnection()` transfers
state via `Connection.metadata` with automatic fallback on failure.

**Backpressure:** `BACKPRESSURE_TIMEOUT` + `MAX_FRAME_EXCEEDED` codes bound slow consumers
(streaming generation must pause on backpressure rather than buffer unbounded).

## Upgrade — `src/transport/upgrade.ts`

`upgradeConnection(current, targetProtocol, config)` — validates the path (see matrix),
transfers `Connection.metadata`, graceful handoff with automatic fallback. Used for
HTTP→WebSocket (chat page opens WS for live updates) and WebSocket→WebTransport (progressive
enhancement).

## Testing — `src/transport/test/harness.ts`

`validateProtocol(handler, tests)` — suite runner. `buildDefaultTests()` — smoke defaults
(connect/send/close, compression round-trip, negotiation). Each new adapter (SSE, H3, WT)
must extend the default suite.

---

## Consumer / Interconnection Map

Which future feature consumes which protocol. This is the contract between transport and
the rest of the roadmap.

| Feature (source)                              | Protocol(s)            | Why |
| --------------------------------------------- | ---------------------- | --- |
| REST routes, static assets (`api-routes.md`)  | HTTP/1.1 (+ H2 push)   | discrete requests, htmx |
| Chat generation streaming (`chat/generation.md`) | SSE (web), WS (TUI) | token-by-token |
| TUI client (`src/tui/app.ts`)                 | WebSocket              | persistent live connection |
| Typing / presence indicators                 | SSE / WS / WT          | downstream-only or bidirectional |
| Group chat (`chat/group-chat.md`)            | WebSocket, WebTransport | multi-participant streams |
| Co-authoring (#19)                            | WebSocket, WebTransport | per-user streams, no HOL block |
| Notifications (`notifications.md`)           | SSE, WebSocket         | server push, toasts |
| Async NPC mail (#22)                          | SSE / notifications channel | server→client delivery |
| Asset pipeline (`assets.md`)                 | HTTP/2 server push     | proactive delivery |
| Multi-LLM story (`multi-llm-story.md`)       | HTTP/2 streams         | parallel turns |
| Cross-device E2E sync (#25, `crypto.md`)     | HTTP/3 / WS binary     | fast resume, ciphertext frames |
| Offline-first PWA (#23)                       | HTTP/3 / WS            | resilient reconnect |
| Horizontal scaling (Redis WS, roadmap)        | WebSocket + broker     | shared connection state |

---

## External Protocols — Out of Scope for Core Transport

POP3 / IMAP / SMTP / XMPP / MQTT are **not** part of the unified transport abstraction.
They are application-level (or federation-level) concerns and belong in the
**plugin / integration layer** (`docs/spec/plugin-system.md`), not `src/transport/`.

| Protocol | Would live in | Loop-lore relevance |
| -------- | ------------- | ------------------- |
| XMPP     | federation plugin | possible decentralized chat federation (future) |
| SMTP/IMAP/POP3 | notification/integration plugin | async NPC mail (#22) could bridge to email; not core |
| MQTT     | IoT/integration plugin | not currently needed; possible device sync |

**Position:** keep `TransportProtocol` to real wire transports (HTTP/1.1, HTTP/2, HTTP/3,
WebSocket, SSE, WebTransport, and the low-level Tcp/Tls primitives). Federation/external
protocols sit above the app layer and reuse the negotiated transport, not extend the enum.

## Integration Points

| Layer               | Entry Point                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| Server (HTTP/HTTPS) | `src/server.ts` → `createProtocol({ protocol: 'http/1.1' })`            |
| WebSocket           | `src/server.ts` → upgrade → `createProtocol({ protocol: 'websocket' })` |
| SSE                 | `src/server.ts` → `Accept: text/event-stream` route → `createProtocol({ protocol: 'sse' })` **[GAP]** |
| WebTransport        | `src/server.ts` → WT endpoint **[GAP]**                                 |
| Client (TUI)        | `src/tui/app.ts` → `createProtocol({ protocol: 'websocket' })`          |
| Client (Web)        | Static JS → `new WebSocket()` / `new WebTransport()` / `EventSource`    |

## Config — `src/config/schema.ts`

`TransportConfig`: `defaultProtocol`, `enableWebSocket`, `enableWebTransport`, `enableH2`,
`enableH3`, `enableSse` **[GAP]**, `compression` (enabled, default algo, threshold),
`limits` (maxFrameSize, maxPayload, maxConcurrentStreams).

Env overrides: `TRANSPORT_*` vars (12). Add `TRANSPORT_ENABLE_SSE` when SSE lands.

## Error Handling — `src/transport/errors.ts`

`TransportError` extends Error with `code`, `recoverable`, `cause`.

Codes: `PROTOCOL_UNSUPPORTED`, `NEGOTIATION_FAILED`, `COMPRESSION_FAILED`, `UPGRADE_FAILED`,
`CONNECTION_CLOSED`, `BACKPRESSURE_TIMEOUT`, `MAX_FRAME_EXCEEDED`.

## Future

- HTTP/3 / QUIC native (when Bun stabilizes QUIC listeners)
- HTTP/3 prioritization + 0-RTT
- WebTransport bidirectional streams + datagrams
- SSE adapter + enum entry
- Custom protocol plugins (federation/XMPP above the app layer)
- Per-protocol observability hooks for horizontal scaling (Redis-backed WS)
