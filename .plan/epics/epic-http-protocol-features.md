<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: HTTP/2 / HTTP/3 / Elysia Protocol & Feature Adoption

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Infrastructure Epic
**Tags:** http2, http3, quic, tls, alpn, elysia, openapi, opentelemetry, transports

## Summary

Consolidation of a protocol/feature review of Bun 1.4.0 `Bun.serve` and Elysia
1.4.29 against loop-lore's server architecture. Most of this surface is already
owned by existing epics; this epic cross-references them and files only the
genuine gaps as tickets.

**Integration point (verified in `src/server/start.ts`):** the server calls
`serve()` from `"bun"` directly. Elysia is only a `fetch` handler
(`createRequestHandler(app, …)` → `app.handle`); Elysia never `.listen()`s. So
all socket-level protocol options live on `Bun.serve`, not in Elysia. Today two
servers run: plaintext HTTP on `config.server.port` and TLS on `port + 443`. The
transport layer (`src/transport/`) already has `ws.ts` / `h2.ts` / `http1.ts`
app-level abstractions.

**Findings**

- **HTTP/2** — automatic when `tls` is set (ALPN negotiates h2/h1.1; Bun v1.3.14:
  "binds TCP for HTTP/1.1+2"), no extra flag. Benefit: multiplexed static assets
  and concurrent SSE for the Web UI. Gap: only the `port+443` TLS server negotiates
  h2; the main app port is plaintext, so clients never get h2. → consolidate to a
  single TLS port (ALPN yields h1.1+h2).
- **HTTP/3 / QUIC** — experimental in 1.4.0 (`http3: true` + `tls`); same port
  serves TCP (h1.1/2) + UDP (h3); auto `Alt-Svc`. **Blocker:** WebSocket over
  HTTP/3 is unsupported (`server.upgrade()` returns false; Bun v1.3.14
  §Limitations). loop-lore's WebSocket transport would break. **Hold inbound
  http3** until Bun ships WS-over-H3. Outbound `fetch()` accepts
  `protocol: "http2" | "http3"` (Bun 1.4) — safe, independent win for provider calls.
- **Other Bun** — `server.reload()` for zero-downtime cert/key rotation (replaces
  the full SIGHUP restart that drops live WS/transport sockets); `requestIP()` for
  rate-limit/access-log; streaming + `Bun.file` zero-copy.
- **Elysia** — `@elysia/openapi` is already a dependency; wire it to emit a
  generated, served spec (satisfies the automated-doc rule: generate from source,
  serve, never hand-maintain). `@elysiajs/opentelemetry` — evaluate vs the
  existing custom telemetry module.

## Scope

- Enable HTTP/2 via single-TLS-port consolidation → refs `epic-certificate-and-tls-management.md`
- Adopt `server.reload()` for cert/key rotation → refs `epic-certificate-and-tls-management.md`
- Outbound `fetch` HTTP/2/3 protocol hints for generation provider calls (new)
- Hold inbound HTTP/3; track Bun WS-over-H3 → refs `epic-realtime-transports.md`
- Wire `@elysia/openapi` mount → refs `epic-api-openapi.md`
- Evaluate `@elysiajs/opentelemetry` → refs `epic-observability-telemetry.md`

## Non-Goals

- Replacing the custom static-file handler (`src/server/static-files.ts`) with the
  Elysia static plugin — it adds hashed-asset immutable caching, precompression,
  and traversal guards not covered by the plugin.
- Replacing custom auth / NSFW / rate-limit middleware with Elysia plugins — already covered.
- Enabling inbound HTTP/3 in production (blocked by WS-over-H3).

## Tasks (tickets)

- [ ] TASK-enable-http-2-via-single-tls-port-consolidation — `src/server/start.ts` dual-port → single TLS port; ALPN h1.1+h2
- [ ] TASK-outbound-fetch-http-2-3-protocol-hints — config-driven `protocol` hint on provider `fetch`
- [ ] TASK-replace-sighup-restart-with-server-reload — `server.reload()` for cert/key rotation, no dropped sockets
- [ ] TASK-wire-elysia-openapi-mount — mount `@elysia/openapi`; serve generated spec
- [ ] TASK-hold-inbound-http-3-until-bun-ws-over-h3 — track Bun; keep inbound h3 off
- [ ] TASK-evaluate-elysia-opentelemetry — vs custom `src/telemetry/`

## Dependencies

- `epic-certificate-and-tls-management.md` — TLS modes, lifecycle, rotation
- `epic-api-openapi.md` — generated OpenAPI (already sketches a generator; prefer the dependency)
- `epic-realtime-transports.md` — WS / WebTransport / SSE; WS-over-H3 constraint
- `epic-observability-telemetry.md` — telemetry module

## Notes

- Bun 1.4.0 includes HTTP/3 (landed v1.3.14) but it remains experimental.
- Any implementation ticket requiring tests MUST use parallel-safe design:
  kernel-assigned ports (`port 0`) or per-test offsets, unique temp dirs via the
  runner's tmp facility, deterministic teardown in `afterEach`/`finally`. This
  satisfies the `parallel-safe-tests` rule.
- The OpenAPI ticket mandates generated-from-source docs (TypeBox `t` schemas via
  `@elysia/openapi`), served, never hand-maintained — satisfies the
  `automated-api-documentation` rule.
