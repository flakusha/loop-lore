<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Realtime Transports

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** websocket, webtransport, realtime, sse, transports
**Parent Epic:** Headless Mode & Alternative Frontends (epic-headless-alternative-frontends.md)

## Summary

WebSocket and WebTransport endpoint support alongside the existing HTTP/SSE surface, plus the transport-agnostic real-time state contracts that every SDK and alternative frontend consumes for live updates.

## Scope

- WebSocket endpoint support
- WebTransport endpoint support
- Real-time state contracts (shared live-update semantics over WS / SSE)

## Design Notes

- **Real-time state contracts:** all SDKs consume the same live-update contract —
  streaming message/token deltas, generation progress, presence — regardless of the
  underlying transport. The bundled frontend's SSE streams and the new WebSocket /
  WebTransport endpoints must emit equivalent event envelopes so `@loop-lore/client`
  (see `epic-shared-client-sdk.md`) can pick a transport without changing consumer code.
- **Transport selection:** HTTP SSE remains the baseline fallback; WebSocket is the
  default bidirectional path; WebTransport covers environments where WS is blocked or
  datagram latency matters.

## Tasks

- [ ] WebSocket endpoint support
- [ ] WebTransport endpoint support
- [ ] Real-time state contracts — transport-agnostic live-update event envelopes shared by SSE/WS/WebTransport and consumed by all SDKs

## Dependencies

- **Parent hub:** Headless Mode & Alternative Frontends (`epic-headless-alternative-frontends.md`)
- **Siblings:** independent of `epic-api-first-foundation.md` at the endpoint level, but
  its contracts feed `epic-shared-client-sdk.md` (`@loop-lore/client` real-time layer) —
  coordinate envelope shapes before stabilizing either.
- Can proceed in parallel with the rest of the hub.

## Related Epics

- `epic-transport-expansion.md` — prior transport-layer expansion work
- `epic-transport-layer-expansion.md` — transport layer architecture
- `epic-shared-client-sdk.md` — client-side consumption of these contracts
