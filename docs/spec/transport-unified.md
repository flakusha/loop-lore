<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md. Design spec for the unified transport layer; see `.plan/epics/epic-transport-expansion.md`.

# Unified Transport Abstraction

**Status:** Partial. HTTP/1.1 + WebSocket functional; HTTP/2 stubbed (handler exists, `send()` is a no-op — do not advertise as production-ready despite the epic claiming "Built"); HTTP/3, WebTransport, SSE not implemented.

## Implemented

- Core contract `ProtocolHandler` (connect/send/get/close) + `Connection` + optional `ProtocolEvents` emitter — `src/transport/protocol.unified.ts`; adapters share `TransportBase` (`base.ts`).
- Factory `createProtocol(config)` (`factory.ts`): selection priority config.protocol → Accept → ALPN → http/1.1 fallback; unknown protocols throw `TransportError(ProtocolUnsupported)`; applies `withCompression` when enabled.
- Adapters: HTTP/1.1 (`http1.ts`, keep-alive + idle timeout), WebSocket (`ws.ts`, frames, ping/pong, pending queue, server-side `attach()`), HTTP/2 (`h2.ts`, stub).
- Compression (`compression.ts`): zstd → br → gzip → none via `Accept-Encoding`/`Content-Encoding`, size threshold, protocol-agnostic.
- Negotiation (`negotiation.ts`) + upgrade (`upgrade.ts`) with metadata transfer and automatic fallback; backpressure codes `BACKPRESSURE_TIMEOUT` / `MAX_FRAME_EXCEEDED`. `DEFAULT_CAPABILITIES` advertises HTTP/1.1 only.
- Test harness `validateProtocol` + `buildDefaultTests` (`src/transport/test/harness.ts`); `TransportError` codes in `errors.ts`; `TransportConfig` in `src/config/schema.ts` with `TRANSPORT_*` env overrides.

## Not implemented / aspirational (gaps)

- SSE adapter + `Sse` enum entry (`Accept: text/event-stream`), HTTP/3/QUIC, WebTransport — all consume-side uses (generation streaming, notifications, co-authoring, asset H2 push) blocked on them.
- Real H2 server wiring, stream lifecycle, server push; extending `DEFAULT_CAPABILITIES` beyond HTTP/1.1.

## Unique content

- External protocols (POP3/IMAP/SMTP/XMPP/MQTT) are deliberately **out of scope** for `src/transport/` — they belong to the plugin/integration layer (`docs/spec/plugin-system.md`); `TransportProtocol` stays wire-transports only.
- Negotiation/upgrade matrix (HTTP/1.1 ↔ H2 ↔ WS ↔ SSE ↔ WT via ALPN/Upgrade/Accept) and per-feature protocol consumer map were only documented in this spec's history — re-derive from `src/transport/negotiation.ts` / `upgrade.ts` when needed.

## Epics

- `.plan/epics/epic-transport-expansion.md`
- `.plan/epics/epic-realtime-transports.md`
