<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
<!-- Companion to: .plan/tickets/TASK-federation-peer-audit-probe-zero-trust-cross-instance-verifi.md -->
<!-- Research basis: .tmp/fed-research/topic-4-zero-trust.md -->

# SPEC: Federation Peer Audit Probe (Zero-Trust Cross-Instance Verification) — Implementation

**Companion to:** `TASK-federation-peer-audit-probe-zero-trust-cross-instance-verifi.md`
**Status:** ready for implementation
**Author:** research synthesis, 2026-09-24
**Research basis:** `/.tmp/fed-research/topic-4-zero-trust.md`

---

## Design Decisions (resolved from open questions)

| Question (from research) | Decision | Rationale |
| --- | --- | --- |
| Who is the attester? | Instance self-signs SVID using its actor-key infrastructure (HTTP-signature) | No external attester needed; loop-lore's `epic-crypto.md` already provides actor signing keys |
| Revocation: list vs transparency log? | BOTH — local short revocation list (operator-controlled) + optional Rekor inclusion check | Belt + suspenders; Rekor optional for air-gap |
| TKA equivalent? | Per-instance TKA — each instance maintains its own append-only AUM chain; AUMs are signed and replicated to trusted peers on every transition | Tailscale's per-tailnet TKA maps cleanly to per-instance; cross-instance TKA is a follow-up |
| 6h TTL appropriateness? | 6h for normal probe; 30min TTL for the defederation-trigger attestation | Hybrid model: short TTL for high-risk ops, longer TTL for routine probe |
| Attestation scope? | build identity + admin-set tags (instance metadata) + last-defederation timestamp | Narrow scope keeps verification fast; richer attestations can layer on |
| Self-hosted transparency log? | DEFAULT: public Sigstore Rekor; OPTIONAL: self-hosted Rekor via `config.federation.rekor_url` | Matches the build-identity-hash design; air-gap still possible |
| Hardware attestation? | NOT REQUIRED in V1; software-keyed TKA is sufficient; document TPM/SEV future | Hardware attestation is a complex future; current threat model is operator compromise, not host compromise |

---

## 1. Threat Model

A federated loop-lore instance must defend against:

1. **Compromised peer instance** — running modified code that bypasses moderation, leaks data, or impersonates other instances.
2. **Compromised peer admin** — operating a peer that has been subverted at the operator level (e.g., a hostile instance in a federation).
3. **Man-in-the-middle** — TLS termination by an attacker with a stolen CA.
4. **Replay attacks** — old signed attestations replayed after a peer has been defederated.
5. **Transitive trust downgrade** — a peer trusts an origin that the local instance does NOT trust, enabling information leakage.

The audit probe verifies that **at probe-time** the peer is:
- Running the exact bytes advertised in `buildHash`.
- Presenting consistent identity across surfaces (NodeInfo, instance-state, well-known).
- Bounded in its trust graph (no transitive trust to origins we don't trust).
- Maintaining its defederation audit log (active ops hygiene).

---

## 2. Probe Protocol

### 2.1 Endpoint shape

```http
GET /_attest
Host: <peer-origin>
Accept: application/json
Date: <RFC 7231>
Signature: keyId="<instance-http-sig-key>",algorithm="rsa-sha256",...
```

Response:

```json
{
  "spiffe_id": "spiffe://instance.example/instance/abc123",
  "svid": "<JWT, RS256>",
  "svid_expires_at": "2026-09-25T03:00:00Z",
  "build_identity": {
    "buildHash": "sha256:abc...",
    "buildHashShort": "abc1234567890123",
    "gitHead": "b2c3d4e5...",
    "sourceTreeHash": "sha256:def..."
  },
  "features": ["federation_v2", "defederation", "audit_probe"],
  "trust_chain": {
    "aum_seq": 42,
    "aum_root": "sha256:789...",
    "last_defederation_at": "2026-09-20T11:00:00Z"
  },
  "nonce_echo": "<echo of client's challenge nonce>"
}
```

The HTTP signature is verified against the peer's known public key (TOFU on first contact; thereafter trusted via `peer_registry.trust_state`).

### 2.2 Client probe flow

```ts
// src/federation/audit/probe.ts (excerpt)
export async function probePeer(origin: string, opts: ProbeOpts): Promise<PeerAuditReport> {
  const nonce = crypto.randomUUID();
  const challenge = await buildSignedChallenge(origin, nonce, opts.localKeys);

  // Step 1: HTTP-sign GET /_attest with challenge nonce.
  const res = await peerFetch(origin, "/_attest", {
    method: "GET",
    headers: { "X-Challenge": challenge.nonce, "X-Audit-Token": challenge.token },
  });
  if (!res.ok) return failure("attest_unreachable", res.status);

  const body: AttestResponse = await res.json();

  // Step 2: Verify HTTP signature on the response.
  const sigOk = await verifyHttpSignature(body, origin, opts.knownKeys);
  if (!sigOk) return failure("attest_bad_signature");

  // Step 3: Check SVID expiry.
  if (new Date(body.svid_expires_at) <= new Date()) return failure("attest_expired");

  // Step 4: Build identity check.
  const buildPins = opts.peerPins[origin] ?? [];
  if (buildPins.length > 0 && !buildPins.includes(body.build_identity.buildHash)) {
    return failure("untrusted_build", { peerBuildHash: body.build_identity.buildHash, localPins: buildPins });
  }

  // Step 5: NodeInfo consistency.
  const [nodeinfo, instanceState] = await Promise.all([
    peerFetch(origin, "/nodeinfo/2.1"),
    peerFetch(origin, "/api/instance-state"),
  ]);
  const consistent = checkNodeInfoConsistency(body, nodeinfo, instanceState);
  if (!consistent.ok) return failure("inconsistent_identity", { diff: consistent.diff });

  // Step 6: Trust-boundedness.
  const peerPeers = await peerFetch(origin, "/.well-known/loop-lore/peers");
  const unbounded = findUnboundedTrust(peerPeers, opts.localSeeds);
  if (unbounded.length > 0) return failure("unbounded_trust", { origins: unbounded });

  // Step 7: Defederation audit log probe.
  const audit = await peerFetch(origin, "/api/admin/federation/audit?since=" + encodeURIComponent(daysAgo(30)));
  if (!audit.ok) return failure("audit_unreachable");
  if (audit.entries.length === 0 && isPeerActive(origin)) {
    return failure("stale_audit", { last_entry: null });
  }

  return success({ ... });
}
```

### 2.3 Verdict enum

```ts
export type AuditVerdict =
  | "ok"
  | "unreachable"
  | "attest_unreachable"
  | "attest_bad_signature"
  | "attest_expired"
  | "untrusted_build"
  | "inconsistent_identity"
  | "unbounded_trust"
  | "stale_audit"
  | "audit_unreachable"
  | "rate_limited";           // remote instance throttled us
```

`ok` is the only passing verdict; everything else is a failure that counts toward the auto-suspend threshold.

---

## 3. Scheduled Probe Job

```ts
// src/federation/audit/scheduler.ts
export interface ProbeScheduleConfig {
  enabled: boolean;
  interval_hours: number;            // default 6
  per_peer_jitter_seconds: number;    // default 300 — spread probes across the window
  failure_threshold: number;          // default 3 — auto-suspend after 3 consecutive failures
  failure_window_hours: number;       // default 24
  per_request_timeout_seconds: number;// default 10
}

export async function runAuditPass(opts: ProbeScheduleConfig): Promise<PassSummary> {
  const db = getDb();
  const peers = await db.selectFrom("peer_registry")
    .select(["origin", "trust_state"])
    .where("trust_state", "=", "trusted")
    .execute();

  const summary: PassSummary = { probed: 0, ok: 0, failed: 0, suspended: 0 };
  for (const peer of peers) {
    summary.probed++;
    const jitterMs = Math.floor(Math.random() * opts.per_peer_jitter_seconds * 1000);
    await sleep(jitterMs);

    const report = await probePeer(peer.origin, { ... });
    await recordAuditRun(db, peer.origin, report);

    if (report.verdict === "ok") {
      summary.ok++;
      await resetFailureCounter(db, peer.origin);
    } else {
      summary.failed++;
      const count = await incrementFailureCounter(db, peer.origin);
      if (count >= opts.failure_threshold) {
        await autoSuspend(db, peer.origin, report);
        summary.suspended++;
      }
    }
  }
  return summary;
}
```

The cron entry:

```ts
// src/cron/federation-audit.ts
cron.schedule(`every ${opts.interval_hours}h`, () => runAuditPass(opts));
```

Operator override: `bun run scripts/audit-pass.ts --peer=<origin>` runs a single-peer probe synchronously and prints the result.

---

## 4. Probe Signatures (HTTP-Signature)

The probe uses the existing HTTP-signature infrastructure from `epic-crypto.md` (the actor-key + HTTP-signature verifier already powers the federation inbox). Reuse:

```ts
import { signRequest, verifySignature } from "../crypto/http-signature";

async function buildSignedChallenge(origin: string, nonce: string, localKeys: LocalKeyMaterial): Promise<Challenge> {
  const body = JSON.stringify({ origin, nonce, issued_at: new Date().toISOString() });
  const token = await signRequest({ method: "GET", path: "/_attest", body }, localKeys.signingKey);
  return { nonce, token };
}
```

The peer verifies the challenge signature before responding (prevents spam probes).

---

## 5. `peer_audit_runs` Table

```sql
CREATE TABLE peer_audit_runs (
  id            TEXT PRIMARY KEY,                     -- ULID
  origin        TEXT NOT NULL,
  ran_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  verdict       TEXT NOT NULL,                        -- AuditVerdict
  breakdown     JSONB NOT NULL,                       -- { build: ..., nodeinfo: ..., trust: ..., audit: ... }
  signed_challenge TEXT,                              -- the request token sent (for replay)
  signed_response  TEXT,                              -- the response token received
  duration_ms   INTEGER,
  failure_count INTEGER NOT NULL DEFAULT 0,           -- consecutive failures at run time
  UNIQUE (origin, ran_at)
);

CREATE INDEX peer_audit_runs_origin_ran_idx ON peer_audit_runs(origin, ran_at DESC);
CREATE INDEX peer_audit_runs_verdict_idx ON peer_audit_runs(verdict);
```

Retention: a daily cleanup job removes rows older than 30 days (`DELETE FROM peer_audit_runs WHERE ran_at < now() - interval '30 days'`).

---

## 6. AUM Chain (TKA-equivalent)

Per-instance append-only chain of authority update messages:

```sql
CREATE TABLE peer_aum_chain (
  id            TEXT PRIMARY KEY,                     -- ULID
  origin        TEXT NOT NULL,                        -- peer whose trust chain this is
  seq           BIGINT NOT NULL,                      -- monotonic per-origin
  type          TEXT NOT NULL                         -- 'genesis'|'signer_add'|'signer_remove'|'revoke'|'defederate'
                  CHECK (type IN ('genesis','signer_add','signer_remove','revoke','defederate')),
  subject       TEXT,                                 -- the instance being added/removed/revoked
  prev_hash     TEXT NOT NULL,                        -- previous AUM's hash; genesis = 'sha256:0000...'
  payload       JSONB NOT NULL,                       -- type-specific payload
  signature     TEXT NOT NULL,                        -- signed by current signing node
  signed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (origin, seq)
);

CREATE INDEX peer_aum_chain_origin_seq_idx ON peer_aum_chain(origin, seq DESC);
```

The genesis AUM is created when a peer is first trusted. Each subsequent AUM (e.g., adding a new signing node, removing one, defederating a transitive peer) appends to the chain. The hash chain is verified on each probe step (Step 6 in §2.2).

---

## 7. Auto-Suspend Integration

When the failure counter hits the threshold, the audit module calls into the defederation service (from `TASK-federation-defederation-admin-operations-peer-state-block-al`):

```ts
// src/federation/audit/auto-suspend.ts
import { defederate } from "../defederation/service";

export async function autoSuspend(db: Kysely<DB>, origin: string, report: PeerAuditReport): Promise<void> {
  const syntheticCaller = {
    actor_id: "system:federation-audit",
    role: "admin" as const,
    request_id: report.id,
  };
  await defederate(db, syntheticCaller, await getBlockIdForDomain(db, origin), {
    hard: false,
    reason: `auto-suspend after ${report.failure_count} consecutive audit failures; last verdict: ${report.verdict}`,
  });

  log.event({
    event: "federation.audit.auto_suspend",
    origin,
    reason: report.verdict,
    breakdown: report.breakdown,
  });

  // Append to the AUM chain so the local instance remembers the auto-suspend decision.
  await appendAUM(db, origin, {
    type: "defederate",
    subject: origin,
    payload: { reason: report.verdict, report_id: report.id },
  });
}
```

The `actor_id: "system:federation-audit"` lets the audit log distinguish auto-suspends from human-initiated defederations.

---

## 8. Manual Probe Endpoint

```ts
// src/routes/admin/federation-audit.ts
export function federationAuditAdminRoute(): Elysia {
  return new Elysia()
    .use(requireRole("admin"))
    .post("/api/admin/federation/peers/:origin/audit", async (ctx) => {
      const { origin } = ctx.params;
      const report = await probePeer(origin, { ...opts, singlePeer: true });
      await recordAuditRun(getDb(), origin, report);
      return report;
    })
    .get("/api/admin/federation/peers/:origin/audit/history", async (ctx) => {
      const { origin } = ctx.params;
      return getAuditHistory(getDb(), origin, { limit: ctx.query.limit ?? 50 });
    });
}
```

---

## 9. Peer-Side `/.well-known/loop-lore/peers`

Peers expose their trusted-origin list (opt-in):

```ts
// src/routes/peer-trust-list.ts
app.get("/.well-known/loop-lore/peers", async () => {
  if (!config.federation.exposePeerTrustList) return new Response(null, { status: 404 });
  const trusted = await db.selectFrom("peer_registry")
    .select(["origin", "trust_state"])
    .where("trust_state", "in", ["trusted", "pending"])
    .execute();
  return { trusted_origins: trusted.map((p) => p.origin), updated_at: new Date().toISOString() };
});
```

Default: this endpoint is OFF (404) — operators must opt in to expose their trust graph. The trust-boundedness probe step treats a 404 as `unknown` rather than `unbounded_trust`.

---

## 10. Configuration

```ts
// src/config/sections/federation-audit.ts (new section; barrel-export in orchestrator)
export interface FederationAuditSection {
  enabled: boolean;                          // default false
  interval_hours: number;                    // default 6
  per_peer_jitter_seconds: number;           // default 300
  failure_threshold: number;                 // default 3
  failure_window_hours: number;              // default 24
  per_request_timeout_seconds: number;       // default 10
  peer_pins: Record<string, string[]>;       // origin -> accepted buildHash values
  expose_peer_trust_list: boolean;           // default false — opt-in for /.well-known/loop-lore/peers
  rekor_url?: string;                         // default https://rekor.sigstore.dev; empty disables Rekor
  retention_days: number;                    // default 30
}
```

---

## 11. Module Layout

```
src/federation/audit/
├── index.ts                # public: probePeer, runAuditPass
├── probe.ts                # the 7-step probe (§2.2)
├── attest.ts               # /_attest handler + response builder
├── scheduler.ts            # runAuditPass + cron wiring
├── auto-suspend.ts         # bridge to defederation service
├── aum.ts                  # AUM chain helpers
├── sign.ts                 # HTTP-signature challenge/response
├── routes.ts               # admin endpoints
└── audit.test.ts

src/routes/
└── peer-trust-list.ts      # /.well-known/loop-lore/peers (opt-in)

src/cron/
└── federation-audit.ts     # cron registration

src/config/sections/
└── federation-audit.ts     # config section (see §10)
```

---

## 12. Logging

```ts
log.event({ event: "federation.audit.pass_started", peers_to_probe: peers.length });
log.event({ event: "federation.audit.peer_ok", origin, duration_ms, buildHashShort });
log.event({ event: "federation.audit.peer_failed", origin, verdict, failure_count, duration_ms });
log.event({ event: "federation.audit.auto_suspend", origin, reason, aum_seq });
log.event({ event: "federation.audit.manual", origin, verdict, request_id });
log.event({ event: "federation.audit.retention_cleanup", rows_deleted });
```

---

## 13. Test Plan

### Unit (`src/federation/audit/audit.test.ts`)

- `probePeer` against a mocked peer server that returns valid `/nodeinfo/2.1`, `/api/instance-state`, `/_attest` with signed JWT — verdict `ok`.
- Build hash mismatch (peer reports `abc`, pin is `def`) — verdict `untrusted_build`.
- SVID expiry past — verdict `attest_expired`.
- Bad signature on `/_attest` — verdict `attest_bad_signature`.
- NodeInfo inconsistency (`software.name = "evil-fork"` while buildHash matches) — verdict `inconsistent_identity`.
- Peer trusts origin `evil.com` which is NOT in local seeds — verdict `unbounded_trust`.
- Audit log empty for >30 days on an active peer — verdict `stale_audit`.
- `/.well-known/loop-lore/peers` returns 404 — treated as `unknown` (NOT `unbounded_trust`).
- `runAuditPass` with 3 mocked failures on the same peer triggers `autoSuspend` and calls `defederate` with `actor_id = "system:federation-audit"`.
- AUM chain: append, verify chain hash, reject on tampered payload.

### Integration

- Spin up two real loop-lore instances (A and B), configure A's `peerPins[B] = [<B's buildHash>]`, `enabled = true`.
- Run `runAuditPass` from A — verdict `ok`.
- Modify B's `bun.lock` (or override the buildHash env var), restart B, run probe from A — verdict `untrusted_build`.
- Force 3 consecutive failures (e.g., revoke B's HTTP-signature key between probes), assert A auto-suspends B and writes a defederation audit log entry.

### E2E (`tests/e2e/federation-audit.test.ts`)

- As admin: `POST /api/admin/federation/peers/B/audit` — returns full `PeerAuditReport`.
- `GET /api/admin/federation/peers/B/audit/history?limit=10` — returns the last 10 runs in DESC order.
- Auto-suspend path: configure 3 consecutive failures via a flag, run pass, assert B is suspended in `peer_registry` and the defederation audit log entry exists with `actor_id = "system:federation-audit"`.

---

## 14. Acceptance Criteria (refined)

- [ ] `/_attest` handler returns the signed response on each peer's instance.
- [ ] `probePeer(origin)` returns a typed `PeerAuditReport` with `verdict` enum.
- [ ] All 7 probe steps implemented and unit-tested (build hash, NodeInfo consistency, trust boundedness, audit log freshness, SVID expiry, signature, HTTP timeout).
- [ ] Scheduled `runAuditPass` runs per trusted peer every `interval_hours` (default 6h).
- [ ] Auto-suspend after `failure_threshold` consecutive failures (default 3).
- [ ] Manual admin probe endpoint works end-to-end.
- [ ] Probe challenges/responses signed with HTTP-signature key from `epic-crypto.md`.
- [ ] AUM chain maintained per peer with monotonic `seq` + `prev_hash` linkage.
- [ ] `peer_audit_runs` retains 30 days of results.
- [ ] Integration test: two instances, configure peer pins, assert one-way trust downgrade is flagged.
- [ ] `bun run check` green.

---

## 15. Out-of-Scope Follow-Ups

- Cross-instance TKA (signing nodes distributed across instances) — separate ticket.
- Sigstore keyless signing on the Bun runtime — pending Bun support.
- TPM / SEV hardware attestation — separate ticket when the threat model requires it.
- Self-hosted Rekor with full Merkle-inclusion proofs — already supported via `config.federation.rekor_url` but not exhaustively tested.
- Audit-the-actor (per-user federated identity verification) — separate ticket.

---

## 16. References

1. Tailnet Lock GA: https://tailscale.com/blog/tailnet-lock-ga
2. Tailscale node keys: https://tailscale.com/docs/concepts/node-keys
3. SPIRE concepts: https://spiffe.io/docs/latest/spire-about/spire-concepts/
4. SPIFFE SVIDs: https://spiffe.io/docs/latest/deploying/svids/
5. Rekor overview: https://docs.sigstore.dev/logging/overview/
6. Rekor transparency log: https://deepwiki.com/sigstore/docs/6-rekor-transparency-log
7. Sigstore Policy Controller: https://docs.sigstore.dev/policy-controller/overview/
8. Container image signing: https://www.systemshardening.com/articles/kubernetes/container-image-signing-policy/
9. AWS AG.ACG.11 attestation verification: https://docs.aws.amazon.com/wellarchitected/latest/devops-guidance/ag.acg.11-digital-attestation-verification-for-zero-trust-deployments.html
10. FIDO/OpenID CAP spec: https://zero-trust-insider.contentwave.net/article/fido-openid-launch-continuous-attestation-spec-for-zero-trust
11. Research synthesis: `/.tmp/fed-research/topic-4-zero-trust.md`
