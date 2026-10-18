<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation peer workload wire endpoints

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-federation-offload-quotas
**Related:** TASK-federation-same-host-loopback-peer-auth, TASK-federation-workload-routing-policy
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add the HTTP workload seam between two instances: a receiver that runs a
generation for a peer, and the sender client that calls it.

## Context

`.plan/epics/epic-federation-offload-quotas.md` §2 (transport) and §6
(security). The wire deliberately mirrors the existing mesh pair
`/api/mesh-reserve` + `/api/mesh-deliver` rather than opening a WebSocket:
`src/transport/ws.ts` is a byte pipe whose `ProtocolHandler`
(`src/transport/protocol.unified.ts:29`) defines only `connect` / `send` /
`get` / `close` — no envelope, no auth, no correlation. Building those on it
would be more new code than reusing `postPeerJson`
(`src/federation/peer-fetch.ts:100`).

Receiver: `POST /api/peer-work/run`, mounted only when
`config.federation.enabled`, beside the mesh routes. Sender: a client built on
`postPeerJson` with the caller's `AbortSignal` threaded through `safeFetch`.

Long generations stream back as newline-delimited JSON chunks, matching the
existing generation stream contract rather than inventing a new one.

## Acceptance Criteria

**Behaviour**

- `POST /api/peer-work/run` with a valid peer identity runs the requested
  workload class locally and returns its result; an unknown class is `400`.

- With `config.federation.enabled = false` the endpoint is not mounted and
  answers `404`, exactly like the existing federation routes
  (`src/routes/federation.test.ts:70`).

- The sender client's request body carries the prompt and the minimum context
  slice plus an opaque `assignmentKey` — and nothing else.

**Tests**

- `src/routes/federation-peer-work.test.ts` — enabled/disabled mounting,
  unknown class rejected, valid call succeeds, stream chunks reassemble in
  order.

- A two-instance integration in the style of
  `src/routes/federation-transfer.test.ts` (in-process `PeerPost` forwarding
  to the second Elysia app) proving every byte crosses the real handlers.

**Edge cases**

- An aborted caller signal produces a `499`-family cancellation on the
  receiver and no orphan work on the peer.

- A per-attempt timeout aborts the peer request and leaves the local process
  free — the two budgets are independent.

- A malformed chunk line is a protocol error, not a silently-dropped chunk.

**Concurrency / TOCTOU**

- An in-flight slot is acquired before the request is admitted and released in
  a `finally`, including on the error and abort paths.

**Security**

- The endpoint requires the mesh PSK **and** `workload_trust = true` **and**,
  for `host-local` peers, the per-peer shared token. A `trusted` peer with
  `workload_trust = false` gets `403` while content replication to it still
  succeeds.

- The peer-visible request body is asserted not to match
  `/apiKey|password|secret|token|userId|sessionId|chatId/i` — the assertion
  shape of the existing `/api/instance-state` leak test
  (`src/routes/federation.test.ts:154`).

- Offloaded chat context is refused unless `chats.federation_consented_at` is
  set, via the existing clearance gate (`src/federation/clearance.ts`).

- The auth check happens before admission, not before the final write.

**Regressions**

- `src/routes/federation.test.ts`, `src/routes/federation-mesh.test.ts`,
  `src/routes/federation-transfer.test.ts` green.

**Repo gates**

- `bun run check` green.

## Dependencies

- `TASK-federation-same-host-loopback-peer-auth` (the token check).
- `TASK-federation-workload-routing-policy` (the assignment key it receives).

## Out of Scope

- Quota enforcement (the next quota ticket is the single enforcement point).
- Streaming over WebSocket.

**Context:** The HTTP seam between instances. Deliberately mirrors the existing `/api/mesh-reserve` + `/api/mesh-deliver` pair rather than opening a WebSocket — `src/transport/protocol.unified.ts:29` has no envelope, no auth and no correlation to build on.
**Acceptance Criteria:** The receiver runs a requested class and streams newline-delimited JSON chunks in order; it is not mounted (404) with federation disabled; auth requires the PSK, `workload_trust`, and for `host-local` the per-peer token, checked before admission; the peer-visible body passes the no-leak assertion.

Implementation complete; tests passing; documentation updated.

Implementation complete; tests passing; documentation updated.
