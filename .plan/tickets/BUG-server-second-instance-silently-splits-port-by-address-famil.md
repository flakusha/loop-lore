<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: server-second-instance-silently-splits-port-by-address-family

**Status:** Done
**Status Note (2026-11-18):** Closed by `b9adbc2a1` + `ddc22e015`: the effective server bind is resolved once before DB/state resolution and pinned to IPv4 first with an explicit unresolvable-host error; a second instance on the same host:port now fails with the actionable EADDRINUSE message from `src/server/port-conflict.ts`.
**Priority:** high
**Effort:** Medium
**Epic:** epic-deployment-topologies.md
**Tags:** server, port, bind, address-family, ipv6, multi-instance

**Summary:**

Bun.serve({ hostname: "localhost" }) binds only the first address family it resolves — on this machine ::1 — so a second instance asking for the same port binds 127.0.0.1 at that port instead of failing. There is no EADDRINUSE, no error and no log line: the second instance starts normally, on the same port number, in a different address family. The operator sees two "running" instances and no explanation.

**Depends on:** the landed slug work (b143e1481 derive instance slug from effective server bind; 441782e3e keep shipped defaults inside the XDG state dir) — the port-conflict path this ticket routes into (src/server/port-conflict.ts, naming LOOP_LORE_INSTANCE / --instance) landed with it.

Explicitly NOT building:

- A port-availability registry or instance discovery.
- Automatic port selection or fallback to an ephemeral port.
- Reverse-proxy routing rules for multiple local instances.

**Caveats:** ipv4-only deployments, docker/host networking, localhost resolution order

**Context:**

- packages/core/src/config/sections/server.ts:12-15 supplies the default bind host; src/server/start.ts:238-250 passes it to Bun.serve.
- Report 03 §(c) H3 — note this finding is corrected inside report 03: the earlier framing ("the second instance dies at boot with EADDRINUSE") is wrong. The corrected behaviour is the silent split, which is worse because there is no error to notice.
- Consequence: the port-conflict guard (src/server/port-conflict.ts) never fires, so the operator gets neither an error nor the remedy hint — and two instances are up, sharing the port number, unaware of each other.
- This is the third of the three harness-adjacent federation blockers (with H1 and H16) and the only one that is not about the harness queue.

Minimal fix (report 03 §(c) H3): pin the bind family explicitly — resolve the configured host to one address family at startup and bind that family only, so a second instance on the same port hits EADDRINUSE and takes the existing port-conflict path (which mentions LOOP_LORE_INSTANCE). Keep localhost as the default but make its resolution deterministic and logged ("binding 127.0.0.1:7169").

**Acceptance Criteria:**

- [x] The server binds exactly one address family, chosen deterministically, and logs the resolved host:port it bound.
- [x] Starting a second instance on the same port fails with EADDRINUSE and the existing port-conflict message, including the LOOP_LORE_INSTANCE hint.
- [x] A host = "0.0.0.0" deployment still binds all interfaces as configured.
- [x] A regression test starts two servers on one port and asserts the second one fails.
- [x] The operator guide documents the bind-family behaviour and how to run two local instances (`docs/guide/state-and-instances.md`).
- [x] Tests passing, documentation updated.
**Resolved:** 2026-11-18T05:38:50.658Z Closed by ticket reconciliation on dev (2026-11-18); verification notes cite the landed commits.
