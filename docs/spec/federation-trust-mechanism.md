<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
<!-- Companion to: .plan/tickets/TASK-federation-interconnect-peer-config.md -->
<!-- Companion to: .plan/tickets/TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl.md -->

# SPEC: Federation Trust Mechanism — Implementation

**Companion to:**
- `TASK-federation-interconnect-peer-config.md` (config section shape)
- `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl.md` (TLS / SPKI / mTLS policy)
**Status:** ready for implementation
**Author:** spec synthesis, 2026-09-24

---

## Purpose

A federation trust mechanism is the full lifecycle from operator-configured trust to runtime TLS verification of every cross-instance call. This spec consolidates the two upstream tickets into a single implementation plan: the `federation` config section, the per-peer trust map, the federation HTTP client wrapper that consumes it, and the SPKI pin verifier that preflights trust before issuing a request.

---

## 1. Design Decisions (resolved from open questions)

| Question | Decision | Rationale |
| --- | --- | --- |
| Config section name: `federation` vs `mesh`? | `federation` (umbrella) | `mesh` is reserved for inter-process topology; `federation` already appears in `src/federation/*` |
| Default `federation.enabled`? | `false` | Mirrors `TASK-federation-interconnect-peer-config` direction; opt-in is mandatory |
| Default peer state on gossip discovery? | `pending` | Promotion to `trusted` requires explicit config entry or admin `federate` action |
| TLS escape hatch for self-signed CAs? | Per-peer `trust.ca` only; no fleet-wide disable | Bun fetch validates against OS trust store by default; per-peer custom CA covers self-hosted peers without weakening fleet posture |
| SPKI pinning default? | Off (opt-in per peer); key off `origin` | Off-by-default keeps the TOCTOU race documented but not blocking |
| SPKI pin storage? | `federation.peers[].trust.spkiPins: string[]` (sha256:base64) | Aligned with HPKP convention; the pin set is the union of trusted leaves, not the SPKI hash of any specific cert |
| mTLS app-side support? | None (deploy concern) | Bun fetch has no client-cert option; recommend proxy-terminated mTLS (Caddy `tls_client_auth`) |
| Webfinger / NodeInfo trust on discovery? | Skip until `TASK-instance-state-advertisement-endpoint` lands | Trust by signing follows, not by discovery; handshake happens at first activity |
| Multi-CA bundle format? | PEM concatenated; verifier walks until a match | Standard convention; supports home CAs + intermediate bundles |

---

## 2. Configuration

### Schema — `src/config/sections/federation.ts`

```ts
// Triple pattern: schema + section + meta + defaults (see src/config/sections/server.ts)
import { t } from "../../validation/schemas";

export const federationSchema = t.Object({
  enabled: t.Boolean({ default: false, meta: { description: "Master switch. False = no federation traffic. Always default-off." } }),
  seeds: t.Array(t.String({ format: "url" }), { default: [], meta: { description: "Bootstrap origins; gossip learns from these first." } }),
  peers: t.Array(t.Object({
    origin: t.String({ format: "url" }),                          // canonicalOrigin applied server-side
    displayName: t.Optional(t.String()),
    trust: t.Optional(t.Object({
      ca: t.Optional(t.String({ contentEncoding: "base64" })),    // PEM bundle, base64-encoded for JSON safety
      spkiPins: t.Optional(t.Array(t.String({ pattern: "^sha256:[A-Za-z0-9+/=]+$" }))),
      requireClientCert: t.Optional(t.Boolean()),                 // pairs with reverse proxy client-cert requirement
    })),
    notes: t.Optional(t.String({ maxLength: 1024 })),
  }), { default: [] }),
  defederation_webhook: t.Optional(t.Object({
    enabled: t.Boolean(),
    targets: t.Array(t.String({ format: "url" })),
    hmacSecret: t.String({ minLength: 32 }),                      // signs the webhook body
  })),
});
```

### Section meta + defaults

```ts
export const federationSection = {
  schema: federationSchema,
  meta: { name: "federation", description: "Federation peer trust + interconnect", sensitive: ["peers[*].trust.ca", "defederation_webhook.hmacSecret"] },
  defaults: { enabled: false, seeds: [], peers: [] },
  // shape fingerprint for tamper detection (cf. TASK-build-identity-hash-for-tamper-detection-searxng-style-commi)
  fingerprint: "sha256:federation-section-v1-...",
};
```

### Register in `src/config/index.ts` orchestrator

```ts
import { federationSection } from "./sections/federation";
export const configSections = [serverSection, federationSection, /* ... */];
```

---

## 3. Trust Map Storage

The in-memory trust map (`config.federation.peers[]` projected into a hash) is consulted by every federation HTTP call.

### `src/federation/trust-map.ts`

```ts
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";

export interface TrustEntry {
  origin: string;                          // canonical
  ca?: string;                             // PEM bundle
  spkiPins?: string[];                     // sha256:base64 entries
  requireClientCert?: boolean;
}

export interface TrustMap {
  /** Find a peer's trust override; null if not explicitly trusted. */
  get(origin: string): Promise<TrustEntry | null>;
  /** Update or insert a peer's trust entry (admin endpoint). */
  set(origin: string, entry: TrustEntry): Promise<void>;
  /** List all configured peer origins. */
  list(): Promise<Array<{ origin: string; entry: TrustEntry }>>;
}

/** Factory: load from config + override with admin edits. */
export function createTrustMap(db: Kysely<DB>, config: FederationConfig): TrustMap;
```

The trust map is read at call time; admin edits take effect on the next outbound call (no warmup needed). The `peer_state_transitions` audit log records every admin-side trust edit.

---

## 4. Federation HTTP Client

### `src/federation/peer-fetch.ts` (already exists; spec here documents its contract)

```ts
import type { TrustMap, TrustEntry } from "./trust-map";

export interface PeerFetchOptions {
  origin: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  /** Per-request TLS override; use sparingly. Falls back to trust-map. */
  tls?: { ca?: string };
  /** Sign with the local actor key (ActivityPub). */
  signAs?: string;
  /** Request timeout in ms (default 10_000). */
  timeoutMs?: number;
}

export interface PeerFetchResult<T = unknown> {
  status: number;
  body: T | null;
  /** True if SPKI pin was checked pre-flight and matched. */
  pinnedSpkiMatched?: string;
}

export function createPeerFetcher(opts: {
  trust: TrustMap;
  /** Local actor key for signing. */
  signer: { privateKeyPem: string; keyId: string } | null;
  /** Resolve hostname to IP for TOCTOU race note. */
  dnsResolve: (host: string) => Promise<string[]>;
}): PeerFetcher;

export interface PeerFetcher {
  fetch<T = unknown>(opts: PeerFetchOptions): Promise<PeerFetchResult<T>>;
  /** Verify a peer's leaf SPKI matches the configured pins. */
  verifyPeerPin(origin: string, pins: string[]): Promise<{ matched: string; cachedForMs: number }>;
}
```

### Behavior

1. **Strict-by-default.** Bun fetch with OS trust store; `rejectUnauthorized: true` is implicit. There is no global escape hatch that disables certificate verification. Config rejects `--insecure-federation` style flags at load time.
2. **Per-peer custom CA.** If `trust[origin].ca` is set, fetch uses that PEM bundle via the `tls.ca` option on Bun's underlying request. Verified live (drill: a peer signed by a self-hosted CA must succeed; the same fetch without `ca` must fail with a cert error).
3. **SPKI pin pre-flight.** If `trust[origin].spkiPins` is set, the fetcher opens a `node:tls` socket first (`rejectUnauthorized: false`), captures the leaf SPKI via `getPeerCertificate(true)`, compares against the pin set, and only then issues the regular fetch. Result is cached per origin for the TTL (`config.federation.spkiPinCacheMs`, default 5 min).
4. **mTLS.** App-side is intentionally NOT implemented. The doc + ticket note that mTLS is a deploy concern; recommend proxy-terminated (Caddy `reverse_proxy` with transport client certs + `tls_client_auth` inbound). `requireClientCert: true` on a peer entry is documentation only; enforcement happens at the proxy.
5. **Failure semantics.** A TLS failure marks the peer stale (existing behavior: peer evicted by TTL on next gossip tick), emits a `peer.tls.failure` structured log entry, and never silently downgrades to plaintext.

---

## 5. SPKI Pinning Implementation

### `src/federation/spki-pin.ts`

```ts
import { createHash } from "node:crypto";
import * as tls from "node:tls";

/** Extract the SHA-256 SPKI pin from a DER cert. */
export function spkiPinFromDer(der: Buffer): string {
  // Imported from TASK-build-identity-hash-for-tamper-detection-searxng-style-commi (build-identity util)
  // or a focused helper here.
  // Standard: extract SubjectPublicKeyInfo, sha256 it, base64, prefix with sha256:.
  const spki = extractSubjectPublicKeyInfo(der);   // see build-identity helper
  return "sha256:" + createHash("sha256").update(spki).digest("base64");
}

/** Connect, grab the leaf cert, derive its SPKI pin, return. */
export async function probeSpkiPin(opts: {
  host: string;
  port: number;
  servername?: string;
}): Promise<string>;

/** Compare pin against pin set. */
export function pinsMatch(pin: string, pins: string[]): boolean;
```

### TOCTOU note

The pre-flight-then-fetch pattern has a documented TOCTOU window: a peer that rotates its cert between pin verification and the regular fetch could serve a different leaf. Pin verification is therefore a hardening signal, not a security boundary. Full elimination requires a custom HTTP-over-own-TLS-socket path; flagged as future work (not a blocker for landing).

---

## 6. Module Layout

```
src/federation/
├── trust-map.ts          # TrustMap factory + get/set/list
├── peer-fetch.ts         # existing; doc-contract refresh
├── spki-pin.ts           # new; SPKI helpers + probe
├── spki-pin.test.ts      # new; pinned/unpinned/swap fixtures
├── trust-map.test.ts     # new; get/set/list + audit-log side effects
└── spki-pin-fixture/     # test fixtures (self-signed CA, leaf + key, intermediate)
    ├── ca.pem
    ├── leaf.pem
    ├── leaf.key.pem
    └── intermediate.pem
```

---

## 7. Service Contract

```ts
// src/federation/trust-map.ts
export function createTrustMap(db: Kysely<DB>, config: FederationConfig): TrustMap;

// Admin endpoints (covered separately by the admin UI ticket):
//   GET    /api/admin/federation/peers
//   PUT    /api/admin/federation/peers/:origin
//   DELETE /api/admin/federation/peers/:origin
```

---

## 8. Test Plan

1. **Trust map CRUD**: `get` returns null for unconfigured peer; `set` persists; `list` returns all configured origins; admin-set entries survive restart.
2. **Custom CA drill**: fetch against a self-hosted-CA-signed instance succeeds with `tls.ca` set; same fetch without `tls.ca` fails with a cert error (Bun fetch error code).
3. **SPKI pinning happy path**: pin set matches the live leaf → call succeeds; pin set does not match → call rejected with structured error.
4. **SPKI pinning swap (regression)**: peer rotates cert to a leaf whose SPKI is in the pin set → call succeeds; peer rotates to an unlisted leaf → call rejected.
5. **SPKI cache TTL**: repeated calls within TTL skip the pre-flight (verified via test spy on `probeSpkiPin`).
6. **Strict-default guard**: loading config with `federation.enabled = true` and a sentinel `federation.insecure_skip_tls` (rejected) errors at boot — there is no runtime escape hatch.
7. **Audit log side effect**: admin-set trust edits land in `peer_state_transitions` with actor + before + after + timestamp.
8. **mTLS proxy deploy (smoke)**: docs note that mTLS is enforced at the proxy; integration test uses a fixture where the app trusts the proxy's forward-auth header for client-cert validation.

---

## 9. Migration / Rollout

- **Migration**: no schema change. The trust map reads from `config.federation.peers[]`. Admin-set entries land in the same config table with `sensitive` fields redacted from the audit log payload.
- **Rollout**: `federation.enabled` defaults to `false`; enabling without configured peers is a no-op (no outbound traffic). First-time enable requires an explicit `seeds` list + a `peer_state_transitions` baseline entry.
- **Compat**: existing gossip + delivery paths (`src/federation/gossip.ts`, `src/federation/delivery.ts`) pick up the trust map transparently — the fetcher is the single point of TLS configuration.

---

## 10. Tickets & Cross-links

- **Config section:** `TASK-federation-interconnect-peer-config` (this spec section 2)
- **TLS / SPKI / mTLS:** `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl` (sections 4, 5)
- **Admin UI:** `TASK-federation-admin-ui-for-follows-blocklists-key-rotation` (consumes the trust-map admin endpoints)
- **Defederation:** `TASK-federation-defederation-admin-operations-peer-state-block-al` + `docs/spec/federation-defederation-admin.md` (defederation removes the trust entry)
- **Build identity hash:** `TASK-build-identity-hash-for-tamper-detection-searxng-style-commi` (shares the SPKI extraction helper)
- **Discovery surface:** `TASK-instance-state-advertisement-endpoint`, `TASK-mesh-peer-discovery-gossip`, `TASK-nodeinfo-well-known-discovery-endpoints` (consumed only after this trust layer is in place)
