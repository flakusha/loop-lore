<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation same-host loopback peer auth

**Status:** Done
**Resolution:** `auth_mode` is `tls` (default) or `host-local`; `validatePeerWorkloadSave` derives it from the origin — a loopback host with a token becomes `host-local`, a remote origin with no token stays `tls`. The token is stored encrypted with `encryptValue` under the same server secret the BYOK store uses (`shared_token_enc`), read back only by `src/federation/peer-workload-token.ts` to verify or to present as `Authorization: Bearer` on the workload wire. Save-time validation rejects: non-`http(s)` origin, loopback origin with no token, a `workloadTrust` grant with no token on ANY link kind, an `allowed_workload_classes` entry outside the enum, and a duplicate origin. (The rule this replaced was the opposite: a token on a non-loopback origin was *forbidden* — see the Resolution update below.) No admin response or route returns the token — `WorkloadPeer` exposes `hasSharedToken` only; `peer-registry.test.ts` asserts against the raw serialized response text of the saved row. `peer-workload-token.test.ts` covers the read-back path: round-trip decrypt, unknown peer, no stored token, wrong server secret, and rejection of wrong/truncated/padded/case-shifted and missing/empty/non-string bearers. The no-log property is structural, not asserted: `peer-workload-token.ts` contains no logging call, and a logger capture installed via `setGlobalLogger` did not observe a deliberately injected `getLogger().debug` in that module under `bun --isolate`, so no test for it is claimed.
**Priority:** high
**Effort:** Medium
**Epic:** epic-federation-offload-quotas
**Related:** TASK-federation-peer-registry-workload-columns
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Let a peer on the same host authenticate with a shared token instead of TLS,
so a loopback peer needs no public cert or DNS.

## Context

`.plan/epics/epic-federation-offload-quotas.md` §1, "Same-host peers are peers
with a loopback URL". A same-host peer is **not** a second subsystem. The only
persisted difference is `auth_mode`: `tls` (default, remote) or `host-local`.

Differences that follow, and nothing more:

| | remote | same-host |
| --- | --- | --- |
| CA bundle / SPKI pin | enforced per `FederationPeerTrustConfig` | skipped — no public cert to pin |
| Content encryption | unchanged: receiver's per-sender inbound key, PSK fallback (`src/federation/peer-keys.ts:231`) | unchanged |
| Workload auth | mesh PSK + `workload_trust` | mesh PSK + `workload_trust` + shared token |

The token is stored with `encryptValue` (`src/crypto/byok.ts:83`) under the
same server secret the BYOK key store uses and read back with `decryptValue`
(`:101`). No new encryption facility, no plaintext token column.

The token is **required** for `auth_mode = host-local` and **rejected** for
`tls`. A loopback peer with no token would accept workload calls from any
process that can open a socket to that port, which is not a trust boundary.

## Acceptance Criteria

**Behaviour**

- Saving a peer whose derived `link_kind` is `loopback` without a token is
  rejected with a validation error naming the missing token.

- Saving a peer whose `link_kind` is `remote` with a token is rejected.
- A loopback peer's advertisement fetch skips the SPKI pre-flight in
  `src/federation/spki-pin.ts` and issues no certificate error.

**Tests**

- Token round-trip through `encryptValue`/`decryptValue`.
- Loopback peer with correct token authenticates; wrong, empty and missing
  token each get `403`.

- SPKI pre-flight is not consulted for a loopback peer (asserted by a spy on
  the pin module).

**Edge cases**

- `auth_mode = host-local` on a peer whose origin is later changed to a
  non-loopback URL is rejected at save time, not silently downgraded.

- Token comparison is constant-time; a truncated or whitespace-padded token is
  rejected.

**Concurrency / TOCTOU**

- Token rotation is a single UPDATE; a request authenticating mid-rotation
  either sees the old or the new token, never a half-written value. There is
  no grace window — rotation is operator-driven, unlike the inbound content
  keys which keep one (`src/federation/peer-keys.ts:111`).

**Security**

- The raw token never appears in the DB, in any admin API response, or in any
  log line.

- The token check happens **before** any work is admitted, not before the
  final write.

- Deleting a peer revokes the token alongside the peer's inbound keys and DEK
  export grants.

**Regressions**

- `src/federation/peer-keys.test.ts`, `src/federation/spki-pin.test.ts`,
  `src/routes/federation-mesh.test.ts` green — a loopback peer must still be
  able to receive encrypted content.

**Repo gates**

- `bun run check` green.

## Dependencies

- `TASK-federation-peer-registry-workload-columns` (the `auth_mode` column and
  link-kind derivation).

## Out of Scope

- Workload endpoint authentication (that is the wire ticket's job).
- mTLS client certificates (`TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl`).

**Context:** A peer on the same host has no public certificate and no DNS, so TLS trust checks are unnecessary there — but an open loopback port is not a trust boundary, so a shared token is mandatory for `auth_mode = host-local` and forbidden for `tls`.
**Acceptance Criteria:** A loopback peer without a token and a remote peer with one are both rejected; the correct token authenticates, wrong/empty/missing each get 403; the SPKI pre-flight is skipped for loopback peers; the raw token never appears in the DB, an admin response or a log.

Implementation complete; tests passing; documentation updated.

**Resolution update (branch `fix-federation-peer-credential`):** the "token required for `host-local` and forbidden for `tls`" rule was the root cause of a security hole on the workload wire. Forbidding a token on a remote origin left a `workload_trust` remote peer with no credential at all, and `authorizePeerWork` only verified the token when `auth_mode === host-local`, so a REMOTE peer was admitted on the caller-controlled `x-peer-origin` header alone (reproduced end to end: 200 and the executor ran, with no authorization header). The rule is now inverted for trust: **a `workloadTrust` grant requires a shared token on every link kind** (rejection reason `workload_trust_without_token`, replacing `token_on_remote_origin`), while the loopback-without-token rejection is unchanged. `auth_mode` now selects no bypass at request time: `src/federation/peer-work-auth.ts` verifies the credential for every workload-trusted peer, and TLS/SPKI trust is an additional outbound layer, never the authentication. The acceptance criterion "Saving a peer whose `link_kind` is `remote` with a token is rejected" and the "forbidden for `tls`" line in Context are superseded by this update; every other criterion here still holds.
