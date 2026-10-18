<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Federated Workload Offload & Instance Quotas

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** High
**Effort:** Very High
**Type:** Feature Epic
**Tags:** federation, offload, quotas, routing, peers, mesh, admin, storage
**Depends on:** `epic-mesh-federation-content-sharing.md` (the `mesh_peers`
registry, reservation lifecycle, and per-peer content keys this epic extends),
`epic-frontend-admin.md` (the admin shell this epic's panel slots into),
`epic-llm-request-scheduler.md` (the in-process scheduler whose ceiling this
epic deliberately does not cross)

## Summary

Give a loop-lore instance the ability to **push work to other loop-lore
instances** and to **budget every instance it knows about**. Today an instance
is an island: it generates, embeds, narrates, and stores everything itself, and
it has no model of a peer at all beyond a mesh row used for encrypted content
replication. This epic adds (1) a peer registry that declares what each peer
accepts, (2) a routing policy that decides local-vs-remote per workload with
session stickiness, (3) per-instance performance budgets, and (4) per-instance
storage budgets — plus the admin surface to configure and observe all of it.

The design is deliberately **assignment + quotas, not a cluster**. There is no
scheduler election, no gossip for workload placement, no consensus, no CRDT.
The existing mesh content plane stays exactly as it is; this epic adds a
workload plane beside it and reuses every seam it can.

## Motivation / Problem

A single loop-lore instance runs chat generation, image generation, the aux
enrichment pipeline, TTS, translation, embeddings, and vision inference on its
own hardware. Three concrete failures follow from that:

1. **Idle capacity is invisible.** A dedicated "rpg/assistant" instance sitting
   next to a "business" instance on the same machine has spare GPU and spare
   concurrency while the busy instance queues or degrades. Nothing in the
   product lets one instance name the other as a place to put work.
2. **One slow provider degrades everything.** Provider failover moves between
   *vendors* inside one process; it cannot move work to another *machine*. A
   host whose local model server is saturated has no escape hatch short of a
   config edit.
3. **Nothing bounds a peer.** When instance A pushes to instance B, B has no
   concurrency budget, no requests-per-minute share, and no byte ceiling for
   what it accepts. The mesh reservation path bounds *content bytes per peer*
   (`mesh_peers.capacity_bytes`, `src/db/schema-core.ts:1156`) and nothing
   else — a peer can still saturate B's generation pipeline or B's disk.

## Scope

1. **Instance registry / discovery** — extend the mesh peer row with workload
   metadata and a loopback link kind.
2. **Workload routing / offload** — a policy that picks local vs a peer, with
   per-chat stickiness, and a dispatch seam that composes with — rather than
   conflates — provider failover.
3. **Performance quotas** — concurrency and rate budgets per instance, with an
   explicit advisory/hard split and stated enforcement points.
4. **Storage quotas** — byte budgets for generated assets, reconciled against
   disk reality, with soft/hard limits and an eviction policy.
5. **Admin frontend setup** — a federation panel under the existing admin shell.
6. **Security and trust** — peer authentication, secret storage, data
   minimization across the wire, and audit logging.

### Non-goals

- A general distributed scheduler. `ResourceManager`
  (`src/llm/resource-manager.ts:45`) stays in-process and un-persistent; the
  `ponytail:` note in that file is left standing.
- A gossip protocol for workload placement. `src/federation/gossip.ts` stays a
  peer-*discovery* mechanism; it never carries placement decisions.
- Consensus, leader election, CRDT merge, or schema coordination across
  instances. Those belong to `epic-federation-swarm-sync.md` and
  `epic-multi-instance-reconciliation.md` and are not re-opened here.
- ActivityPub / fediverse actor federation, and `@user@instance` identity.
- Contributor compute nodes for strangers
  (`epic-distributed-compute-sharing.md`) — a peer here is an operator-trusted
  loop-lore instance, not an anonymous GPU donor.
- Billing, metering, or tiering. Quotas here are resource budgets, not money.
- Autoscaling. `epic-multi-instance-reconciliation.md` Phase 4 owns
  auto-scaling triggers; this epic reads load, it does not act on it.
- Cross-region latency optimization or content placement.

## Current State (verified against `src/`)

| Area | File | State |
| --- | --- | --- |
| Mesh peer registry | `src/federation/coordinator.ts:49` | ✅ Built — `upsertPeer`, `setPeerState`, `listPeers`, `touchPeer`, `runResyncPass` |
| Peer advertisement | `src/routes/federation.ts:104` | ✅ Built — `/api/instance-state`, but `capabilities: []` is a hardcoded empty array |
| Peer wire seam | `src/federation/peer-fetch.ts:41,100` | ✅ Built — `fetchPeerAdvertisement`, `postPeerJson` over `safeFetch` with per-peer CA |
| Per-peer content capacity | `src/db/schema-core.ts:1156` | ✅ Built — `mesh_peers.capacity_bytes`, `NULL` = unlimited |
| Reservation lifecycle | `src/federation/sharing.ts:95` | ✅ Built — reserve → push → confirm, TTL-bounded, swept |
| Per-sender content keys | `src/federation/peer-keys.ts:54` | ✅ Built — per-sender inbound keys with grace rotation |
| Negotiation state machine | `src/federation/negotiation.ts:17` | 🟡 Built — the `quota-agreement` state exists but carries no agreed terms |
| Retry outbox | `src/federation/outbox.ts` | ✅ Built — sender-side backoff queue for failed pushes |
| Peer audit (DEK exports) | `src/db/migrations/036_mesh_dek_exports.ts` | ✅ Built — no FKs, audit rows survive peer deletion |
| Workload peer selection | — | ❌ Absent — nothing routes generation to a peer |
| Performance quotas | — | ❌ Absent — no per-instance budget anywhere in `src/` |
| Storage quota enforcement | — | ❌ Absent — `assets.size_bytes` exists (`src/db/schema-content.ts:43`) but nothing budgets it |

## Design

### 1. Instance registry / discovery

The registry is **the existing `mesh_peers` table plus a forward migration**.
This epic adds no fifth peer table. It does *not* get to pretend there are not
already four peer representations, so they are named here explicitly:

| # | Representation | Lifetime | Owns |
| --- | --- | --- | --- |
| 1 | `config.federation.peers[]` (`src/config/schema/federation.ts:15`) | config file | Admin **trust** — which origins are `trusted`, plus per-peer CA/SPKI overrides |
| 2 | `config.federation.seeds[]` (`src/config/schema/federation.ts:45`) | config file | Bootstrap origins to learn peers *from* |
| 3 | `mesh_peers` table (`src/db/schema-core.ts:1156`) | database | Content-plane runtime row: `state`, `capabilities`, `capacity_bytes` |
| 4 | `PeerEntry[]` in `src/transport/peer-table.ts:23` | in-memory, TTL | Liveness only: heartbeat, eviction, replay window |

**Unresolved, and deliberately left to the implementing session:** (1) and (3)
can disagree — config says `trusted`, the row says `pending` — and today nothing
reconciles them; `runResyncPass` only *touches* rows it already knows. (2) and
(4) overlap: `peer-table.ts` is seeded from `seeds` and evicts on heartbeat TTL,
while the gossip pass re-adds from the same list, so a peer can oscillate
between "evicted" and "re-added". This epic does **not** attempt to merge the
four. It attaches workload metadata to (3), treats (1) as the precedence rule
for `workload_trust` (an admin who did not list the origin in
`federation.peers` gets no workload grant, even if the row says `trusted`), and
reads (4) only for liveness. Consolidating the four is a separate change;
naming it here is the correct move rather than silently widening this epic.

| Column | Type | Purpose |
| --- | --- | --- |
| `display_name` | text | Operator-facing label; falls back to the origin in the UI |
| `instance_kind` | text enum | `business` · `rpg` · `assistant` · `dedicated-gpu` · `general` |
| `auth_mode` | text enum | `host-local` · `tls` — see the loopback rule below |
| `workload_trust` | integer | Default-**false** grant to run workloads. Content trust ≠ workload trust |
| `allowed_workload_classes` | text (JSON) | Subset of `PeerWorkloadClass` this peer will accept |
| `sticky_enabled` | integer | Whether chat sessions may pin to this peer |

Existing columns keep their meaning: `origin` (primary key), `state`
(`pending` / `trusted` / `suspended`, `src/federation/coordinator.ts:25`),
`capabilities` (TEXT JSON), `created_at`, `capacity_bytes`.

**Capabilities.** `PeerWorkloadClass` is a closed enum:

```
chat · image · aux · tts · translation · embedding · vision
```

The `/api/instance-state` advertisement (`src/routes/federation.ts:108-121`)
publishes `capabilities` as this enum's member strings, replacing the current
hardcoded `[]`. `mesh_peers.capabilities` already stores TEXT with a `[]`
default, so the wire shape needs no migration. A peer's *declared* classes come
from config (`config.federation.workloadOffload`); its *observed* classes come
from the advertisement on the next `runResyncPass`. Routing intersects the two —
a class must be declared **and** advertised before it is ever selected.

**Same-host peers are peers with a loopback URL.** There is no
same-host subsystem. `canonicalOrigin`
(`src/federation/peer-fetch.ts:76`) lowercases and strips the path; the host is
then classified at load:

- host ∈ {`127.0.0.1`, `::1`, `localhost`, `*.localhost`} → `link_kind: loopback`
- otherwise → `link_kind: remote`

`link_kind` is **derived, never stored** — it is a pure function of `origin`, so
it cannot drift from the URL. The only persisted difference is `auth_mode`:

| | remote peer | same-host peer |
| --- | --- | --- |
| `auth_mode` | `tls` (default) | `host-local` |
| Transport trust | CA bundle and/or SPKI pin from `FederationPeerTrustConfig` | none required — loopback is not remotely reachable |
| SPKI pre-flight (`src/federation/spki-pin.ts`) | enforced when `spkiPins` is set | **skipped** — there is no public cert to pin |
| Content encryption | receiver's per-sender inbound key, PSK fallback (`src/federation/peer-keys.ts:231`) | identical — the existing key machinery already treats sealed-wire and plaintext-PSK as two modes |
| Workload auth | mesh PSK + `workload_trust` + a per-peer shared token | mesh PSK + `workload_trust` + a per-peer shared token |

A same-host peer therefore differs only in that TLS trust checks are unnecessary.
The shared token is stored with `encryptValue` (`src/crypto/byok.ts:83`) under
the same server secret the BYOK key store already uses, and presented as a
bearer credential on the workload wire.

**A shared token is mandatory for EVERY `workload_trust` peer, whatever its
`auth_kind`** — and additionally for `host-local`, whatever its workload trust.
Two independent reasons, and neither of them is "TLS is good enough":

- a loopback peer with no token would accept workload calls from any process
  that can open a socket to that port, which is not a trust boundary;
- for a `tls` peer the `x-peer-origin` header is **asserted, never proven**:
  `src/federation/peer-fetch.ts` records that this runtime enforces no client
  certificate, and the SPKI pin in `src/federation/spki-pin.ts` is an
  *outbound* pre-flight that says nothing about who is calling us. TLS trust is
  an additional layer for a remote peer, never the authentication itself.

Validation on save rejects: a non-`http(s)` origin, a loopback origin without a
token, a `workload_trust` grant with no token on **any** link kind, an
`allowed_workload_classes` entry outside the enum, and a duplicate origin. An
earlier draft of this epic said the opposite — a token on a non-loopback origin
was *forbidden* — which is what left a remote workload-trusted peer with no
credential at all. That rule is replaced, not extended.

### 2. Workload routing / offload

**Peer dispatch is a pre-step, not a provider.** This is the single most
important structural decision in the epic.

`callWithFailover(providers, req, handler?)`
(`src/generation/providers/call-with-failover.ts:35`) picks among **local
`LLMProvider`s registered in `registry.ts`**, skipping any whose local
`circuitBreaker.allowRequest(name)` is false (`:80`). Its chain comes from
`buildFailoverList(primaryName, config?, signal?)`
(`src/generation/providers/registry.ts:189`). Every production dispatch enters
through `scheduledCallWithFailover` (`src/generation/scheduler.ts:75`).

A peer is **never registered as an `LLMProvider`**. Registering one would
collapse two independent decisions into one list and produce three concrete
bugs: a peer failure would trip a *vendor's* circuit breaker and poison a
perfectly healthy local provider's health record; a peer would appear as a
fallback for a chat whose sticky assignment says otherwise; and the aux
pipeline, which builds a single-element failover list on purpose
(`src/aux-pipeline/runner.ts:184`), would silently gain a remote candidate it
never asked for.

Instead, routing resolves **before** the scheduler is entered:

```
call site (chat turn | aux | image | embed | tts | translate | vision)
  │
  ├─ peer-router.resolve({ workloadClass, affinityKey?, signal })
  │     → { target: "local" }              // unchanged behaviour
  │     → { target: "peer", peer, assignmentKey }
  │
  ├─ target === "local"
  │     → scheduledCallWithFailover(...)   // exactly today's path
  │
  └─ target === "peer"
        → POST {peer}/api/peer-work/run   (one attempt)
        → on transport/peer error: ONE retry onto the local path
          via scheduledCallWithFailover
```

Each hop owns exactly **one** failover decision. The receiving peer resolves
*its own* local provider chain through its own `buildFailoverList`, so provider
failover stays entirely inside the hop that has providers.

**Routing policy**, in precedence order, evaluated by a pure
`resolve()` (no clock, no randomness beyond a documented cursor) so it is unit
testable the way `ModelRouter.route()` is (`src/generation/routing/router.ts:58`):

1. **Eligibility** — federation enabled, peer state `trusted`, `workload_trust`
   true, class in the peer's allowed set and in its advertisement, and not
   circuit-open for this class.
2. **Stickiness** — if an assignment exists for `(affinityKey, workloadClass)`,
   that peer is used as long as it stays eligible. Assignments are
   peer-pinned, class-pinned, and released when the peer stops being eligible
   (not merely when it is down: a circuit-open peer releases affinity, and
   reassignment is recorded).
3. **Assignment matrix** — an operator-set preference list per workload class
   narrows the candidate set. If the class has no matrix entry, it is
   local-only. This is the "federation off by default" lever.
4. **Ranking** — among eligible candidates, order by (a) current in-flight
   concurrency headroom, (b) observed latency EWMA, (c) stable origin tiebreak.
   Ranked last: local, used as the universal fallback.

**Affinity.** Only `chat` is sticky. `image`, `embedding`, `tts`,
`translation`, `vision`, and `aux` are stateless per request and may go to any
eligible peer. Stickiness exists because chat context continuity matters; it is
scoped to exactly the class where it does.

**Cancellation, timeout, retry-once.**

- Every peer attempt carries the caller's existing `AbortSignal`. An abort
  mid-flight propagates to the peer HTTP request via `AbortController`, and the
  local `cancel()` path is unchanged.
- Timeout is per-attempt and **bounded below the caller's own budget**: the aux
  pipeline's 2s ceiling (`src/aux-pipeline/runner.ts:180`) must not be spent
  twice. A peer attempt gets `min(configuredPeerTimeout, remainingCallerBudget)`
  and a timeout aborts that attempt only.
- Retry is **once**, and only across the local/remote boundary. A failure that
  came from the local path does not go to a peer; a failure that came from a
  peer goes to local exactly once. Two remote attempts are never made.
- The local retry is a *fresh* attempt, never a continuation: `generation_attempts`
  gets a new row, and the failed attempt is closed with `CancelSource.System` /
  `CancelReason.Error` (`src/db/enums-generation.ts:43`).
- **Partial output is discarded, never concatenated.** Chunks already streamed
  to the client from a failed peer attempt are dropped, and the local retry
  re-streams from the first chunk. Concatenating a partial peer reply with a
  local reply would double-count tokens, corrupt context assembly, and leave the
  client holding text from two different generations. When a stream has already
  emitted bytes the client is told the attempt failed and the message is marked
  failed rather than silently re-generated — this matches the existing
  disconnect semantics and avoids a visibly rewritten reply.
- Aux-pipeline failures keep returning `null` (graceful degradation,
  `src/aux-pipeline/runner.ts:190`); peer unavailability is not an aux error.

**Queue/dispatch seam — which call sites change shape.** Only the sites that
already funnel through `scheduledCallWithFailover` / `callWithFailover`:

| Call site | Change |
| --- | --- |
| `src/generation/generate-route/handler.ts:135` (chat turn) | resolve router first; sticky; peer attempt + local retry-once |
| `src/aux-pipeline/runner.ts:184` (`callAux`) | resolve router first; `null` on peer failure; per-attempt timeout clamped to the 2s budget |
| `src/generation/auto-gen/call-llm.ts:187,236` | resolve router first; same retry-once |
| image / TTS / embedding / translation / vision call sites | resolve router first; these are stateless, so no stickiness |
| `src/generation/scheduler.ts:75` itself | **unchanged** — it stays the local-only executor |

The transport seam is the existing HTTP POST pattern
(`postPeerJson`, `src/federation/peer-fetch.ts:100`), not WebSocket.
`src/transport/ws.ts` is a byte pipe with no application envelope and no
auth (`src/transport/protocol.unified.ts:29` defines only `connect` / `send` /
`get` / `close`). Inventing a WS workload channel would mean building the
envelope, the auth, and the correlation from scratch on a layer that has none
of them. The peer endpoint mirrors the shape of the existing
`/api/mesh-reserve` + `/api/mesh-deliver` pair; a long generation streams back
as newline-delimited JSON chunks, which reuses `safeFetch`'s abort handling.

### 3. Performance quotas

A budget is three numbers per `(peer, workloadClass)`:

| Budget | Unit | Default when unset |
| --- | --- | --- |
| `maxConcurrency` | in-flight requests | unlimited |
| `requestsPerMinute` | requests per rolling minute | unlimited |
| `tokensPerMinute` | completion + prompt tokens per rolling minute | unlimited |

**Counters live in memory, in the receiving process, keyed by
`(peerOrigin, workloadClass)`.** `createRateLimiter({ windowMs, maxRequests })`
(`src/middleware/rate-limit.ts:82`) is the existing sliding-window primitive —
in-memory, `Map<string, number[]>`, pruned every `windowMs` — and is reused
rather than reinvented. Concurrency uses the same `ConcurrencyLimiter`
(`src/llm/concurrency-limiter.ts`) the local scheduler uses, instantiated per
`(peer, class)` instead of per provider.

**Why in-memory and not DB.** The only truthful authority for "is this peer
over its concurrency budget right now" is the live process holding the in-flight
requests. A DB counter would need a distributed reservation to be atomic
across instances, which is a consensus mechanism — explicitly out of scope. The
lifetime consequence is stated rather than hidden: **counters reset on restart**,
which makes them permissive for one window after a crash. The budget itself is
config and survives restart.

**Enforcement is mode-per-budget, and the modes are different in kind:**

| Mode | Behaviour |
| --- | --- |
| `advisory` | Count, expose in the dashboard, never reject. Default for a newly added peer. |
| `hard` | Enforce at the inbound peer-work endpoint. |

A hard budget is enforced at exactly one place — the receiving instance's
`/api/peer-work/run`, **before** any work is admitted — and only after routing
has already failed to find an alternative:

1. **Route away** (preferred, always first). If another eligible peer exists for
   the class, the *sender* excludes the over-budget peer before the call. This is
   why routing reads headroom.
2. **Queue.** If the budget is `maxConcurrency` and the queue depth is under
   `maxQueueDepth`, the request waits for a slot up to the per-attempt timeout.
3. **Reject (last).** Only when there is nowhere else to go: HTTP `429` with a
   `Retry-After` header and an `error_code` from the existing envelope
   vocabulary (`federation.quota_exceeded`; see `epic-error-envelope.md`).
   A peer that is `429` is treated exactly like a peer whose circuit opened —
   excluded from selection for `Retry-After` seconds.

`tokensPerMinute` is **advisory only**. Tokens are not known until a generation
has already been paid for, so a hard token budget cannot reject before the fact
and a post-hoc one is not enforcement. It is reported, not enforced. Naming that
explicitly is better than shipping a knob that does nothing.

**Sharing and observation across instances.** A budget is *declared* by the
receiver and *published* in its advertisement, so the sender's router can read
headroom without a call. Observed usage is reported back by the receiver on the
next advertisement and written to the sender's admin panel read-only. Neither
number is authoritative for enforcement — enforcement is always local to the
instance that owns the work.

### 4. Storage quotas

**Accounting source of truth: the DB.** `assets.size_bytes` is `NOT NULL`
(`src/db/schema-content.ts:43`) and `storage_path` is the on-disk location, so
the authoritative figure for "bytes this instance holds" is
`SUM(assets.size_bytes)`, plus open `mesh_reservations` holds
(`src/federation/sharing.ts:47`). Disk is the thing being reconciled *against*,
never the source of truth — `du` is a walk, not a ledger.

| Layer | Mechanism |
| --- | --- |
| Per-peer inbound ceiling | `mesh_peers.capacity_bytes`, enforced by the existing reservation path — unchanged |
| Per-instance total budget | new `instance_storage_budgets` row: soft bytes, hard bytes |
| Per-class budget (optional) | same table, keyed by asset class (`image`, `audio`, `video`, `other`) |

Soft limit: usage is reported and the dashboard warns; writes continue. Hard
limit: a write whose post-write total would exceed the budget is rejected at the
asset-write seam with the same `429`-family envelope code as performance
(`federation.quota_exceeded`), and generation that would produce the asset is
refused *before* the provider call — paying for an image you cannot store is
the failure mode worth preventing.

**Reconciliation against disk reality** runs on the existing cron seam (the same
mechanism `federation.outbox-drain` uses). It recomputes
`SUM(size_bytes)` and compares it to a bounded directory walk under
`config.assets.uploadDir`:

| Drift | Cause | Action |
| --- | --- | --- |
| DB > disk | manual deletion, external cleanup, failed write | Lower the count to match disk; log the rows that vanished; never re-create the files |
| DB < disk | orphan files, a wiped-then-restored directory | Log the orphans; do **not** adopt them into the DB — an untracked file has no owner, no chat link, and no hash, so adopting it would create inaccessible content that counts against a budget |
| Both wrong | directory itself gone | Quota usage reads zero, writes fail with an `ENOENT`-derived error surfaced as a clear storage error; reconciliation reports the discrepancy loudly rather than silently resetting the budget |

Reconciliation never **raises** a budget and never invents rows. It only moves
the observed number toward disk reality, and every adjustment is an audit row.

**Eviction is opt-in, oldest-first, and never silent.** `soft` limit with no
eviction policy configured means "warn only". When the operator opts into
eviction, assets are ordered by `created_at ASC` among those with
`visibility = archived` first, then unreferenced assets, and each eviction writes
an audit row naming the asset, its bytes, and the reason. An asset referenced by
a live chat message is **never** evicted by a quota sweep — deleting it would
break a conversation. If there is nothing evictable, the write is rejected; the
budget is never exceeded to make room.

**Backup/export.** `epic-database-backup-recovery.md` snapshots the DB; the
asset bytes live outside it, so a peer receiving federated assets changes what
"the backup restores" means. Two rules: (1) a peer-accepted asset is stored
through the same asset pipeline as a locally generated one — same
`storage_path` layout, same `content_hash` — so an existing DB snapshot plus the
asset directory remains a complete restore, with no second backup path; (2) an
eviction sweep emits the same audit rows a manual deletion would, so a restore
can explain the gap. Cross-peer restore is explicitly out of scope.

### 5. Admin frontend setup

The panel lives inside the existing admin shell at `/views/admin`, guarded by
`adminViewGuard` (`src/middleware/admin-gate.ts:20`), which already requires
`admin.system`. No new shell, no new nav system.

**Permission gating reuses the existing vocabulary verbatim.** `can()`
(`src/users/permissions.ts:94`) and `requirePermissionUserId(ctx, "admin.system")`
(`src/routes/http-utils/auth-narrowing.ts:58`) are the gates; every federation
route and every panel action uses `admin.system`. This epic does **not** add a
`federation.*` permission. If a deployment later wants federation config
delegated to a non-sysadmin role, adding one string to the permission list in
`src/users/permissions.ts` and one row to the role map is the whole change —
that is a follow-up decision, deliberately not taken here.

**Reused primitives — nothing new:**

| Need | Existing primitive |
| --- | --- |
| Page shell + tab registration | `src/views/admin.html`, `x-data="adminPage()"`, `src/frontend/alpine/admin.ts:60` |
| Component registration | a `src/frontend/alpine/admin-federation.ts` exporting a plain object spread into `adminPage()`, exactly like `admin-audit.ts` |
| Data fetch | `apiFetch` (`src/frontend/alpine/htmx.ts:30`) over `feFetch` (`src/frontend/fe-fetch.ts:45`) |
| Server-rendered response validation | `parseOr(Schema, …, EMPTY)` against `src/validation/schemas/responses` |
| Live refresh | interval polling, matching the existing admin pattern (`src/frontend/alpine/admin.ts:80`, 30s) — **not** a new SSE channel |
| REST routes | `src/routes/admin/*.ts` with `withPermissionAuth(ctx, "admin.system", …)` and `{ 200, 403 }` response schemas |
| Audit entries | direct insert into `log_entries`, same column set as `src/routes/admin/users.ts:169` |
| Toast / error surfacing | `hx-target-error="#toast-container"` |

**Views added** (all reachable from the existing admin nav):

1. **Peer list** — origin, display name, kind, state, last-seen, link kind
   (loopback/remote), workload trust, class chips, storage usage bar.
   Add/edit/delete with the validation rules from §1; **saving a peer runs a
   live health probe and shows the verdict inline** — a peer that cannot answer
   `/api/instance-state` is saved as `pending`, never as `trusted`, and the
   operator is told why. Delete is a typed-confirm modal and revokes the peer's
   inbound keys and DEK export grants, matching
   `revokeDekExportsForPeer` (`src/federation/dek-rewrap.ts`).
2. **Per-peer quota editors** — concurrency, rpm, advisory/hard toggle, queue
   depth, per-class storage soft/hard bytes, with the current observed values
   shown beside each limit so the operator is editing against reality.
3. **Workload assignment matrix** — rows are workload classes, columns are
   peers, cells are the ordered preference list. An empty class is local-only,
   which is how "federation off" is expressed per class rather than globally.
4. **Usage dashboard** — per-peer in-flight/limit, rpm used, observed latency,
   storage used vs soft vs hard, open reservations, recent quota rejections, and
   circuit state. Read-only.

### 6. Security and trust

- **Peer authentication** is layered, not invented. The workload wire requires
  the mesh PSK *and* `workload_trust = true` *and* the per-peer shared token,
  for **every** workload-trusted peer whatever its `auth_kind`. A peer that is
  trusted for content replication is **not** thereby trusted to run workloads —
  the default for `workload_trust` is false, and the check happens before
  admission, not before the write.
- **One invariant, enforced twice.** `authorizePeerWork`
  (`src/federation/peer-work-auth.ts`) verifies the credential unconditionally,
  and `validatePeerWorkloadSave`
  (`src/federation/peer-registry-validation.ts`) refuses to store a
  `workload_trust` grant with no token on any link kind — so a peer that
  cannot authenticate cannot be configured to be admitted. TLS and the SPKI pin
  are an **additional outbound layer** for a remote peer, never the inbound
  authentication: this runtime enforces no client certificate, so for a `tls`
  peer the `x-peer-origin` header is asserted, not proven. Missing, malformed,
  wrong-peer or empty-key credentials all fail closed.
- **Secret storage** reuses `encryptValue` / `decryptValue`
  (`src/crypto/byok.ts:83,101`, re-exported from `src/crypto/index.ts:51`)
  under the same server secret the BYOK key store uses. No second encryption
  facility, no plaintext token column.
- **Data minimization across the wire.** A workload request carries the prompt
  and the minimum context slice needed, plus an opaque `assignmentKey`. It never
  carries the chat id, the user id, a session cookie, an email, or any other
  chat. The chat → peer mapping stays on the sender. The peer returns content
  and metrics, never identity. This mirrors the existing
  `/api/instance-state` rule of exposing no user identifiers, and its
  no-secret-leak test is the model for the workload endpoint's equivalent test.
- **Data at rest on the peer.** Offloaded output is stored as a normal asset
  through the normal asset pipeline — same encryption tier, same content hash,
  same ownership row. A peer never holds plaintext it cannot decrypt and the
  origin instance never receives a peer's local data.
- **Federation consent.** Chat content may only be routed to a peer when the
  chat opted in — `chats.federation_consented_at`
  (`src/db/migrations/037_chat_federation_consent.ts`), enforced by the existing
  clearance gate (`src/federation/clearance.ts`). The gate default-denies while
  that column is NULL, and offloaded chat context must pass it exactly like a
  replicated message. Mesh membership alone never implies clearance.
- **Audit logging.** Every quota-config change, peer add/remove, trust
  elevation, workload-class grant, quota rejection, and reconciliation
  adjustment writes a `log_entries` row with `event_type`, `entity_type`,
  `entity_id`, `actor`, and a `meta` blob. Quota rejections are logged at
  `warn` with the peer, the class, and the limit that was hit — a peer
  hammering a budget is exactly the signal an operator needs.
- **Egress minimization.** The local peer router never sends a request to a peer
  that has not declared the class, so there is no channel for a caller to
  exfiltrate a prompt to an arbitrary endpoint through the router.

## Observability

Structured logging only, via `getLogger().child({ module: "federation-router" })`
and `"federation-quota"`. Emitted per decision: the resolved target
(`local` / peer origin), the workload class, the reason a candidate was
excluded (`untrusted` / `capability-missing` / `circuit-open` / `over-budget` /
`unreachable`), the observed latency, and whether the local retry-once fired.
Quota rejections and reconciliation adjustments are `warn`; routing decisions
are `info`. Counter state is exposed on the admin dashboard only — the
pre-existing provider-health pattern (`src/admin/provider-health.ts:125`,
in-memory cache exposed for the UI) is the model.

## Testing strategy

**Unit.** The router's `resolve()` is pure and is tested as such — same inputs,
same order — mirroring `router.test.ts`. Quota accounting is tested against an
injected clock, never `Date.now()`. Reconciliation is tested against a temp
directory whose drift is created deliberately. Peer validation rejects each bad
origin/token/class combination individually.

**Integration.** Two real instances over real route handlers, in the style of
`src/routes/federation-transfer.test.ts` (in-process `PeerPost` forwarding to
the second Elysia app, so every byte crosses the real handlers). Covered: a
chat turn routed to a peer and back; a sticky session staying pinned; a peer
going circuit-open and the next turn falling back to local; a hard concurrency
budget returning `429` with `Retry-After` and being excluded afterwards; a
timeout aborting the peer attempt only; partial output discarded rather than
concatenated.

**E2E.** One loopback peer serving a different workload class, driven through
the admin panel: create a peer, run the health probe on save, set budgets, save
a matrix row, watch the dashboard reflect usage. Federation **off** throughout
the rest of the suite: with `config.federation.enabled = false` the panel's
endpoints 404 and no workload path changes shape.

**Security tests — these are the ones that must not be softened:**

1. **No secret or identity leakage on the wire.** The workload endpoint's
   response and the peer-visible request body are asserted not to match
   `/apiKey|password|secret|token|userId|sessionId|chatId/i` — the same
   assertion shape as the existing `/api/instance-state` leak test
   (`src/routes/federation.test.ts:154`).
2. **Workload trust is independent of content trust.** A `trusted` peer with
   `workload_trust = false` gets `403` on the workload endpoint while content
   replication to it still succeeds.
3. **Loopback peers cannot be unauthenticated.** A `host-local` peer whose token
   is cleared, or whose request presents no/wrong token, gets `403`; the
   accepted-origin check is asserted before any work is admitted.
4. **Cross-chat data minimization.** An offloaded request body for chat A does
   not contain chat B's messages, nor chat A's identifier.
5. **Consent gate.** Offloading a chat context whose `federation_consented_at`
   is NULL is refused.
6. **Quota bypass.** A peer cannot exceed a hard budget by re-entering through
   the non-streaming path, the streaming path, or the aux path — all three
   enforcement points are asserted.
7. **Encryption at rest.** A stored peer token round-trips through
   `decryptValue` and the raw token never appears in the DB or in any admin
   API response.

**Regressions that must stay green.** `bun run check`; the existing federation
route suites (`federation.test.ts`, `federation-mesh.test.ts`,
`federation-transfer.test.ts`); `generation/scheduler.ts` behaviour unchanged;
the aux pipeline's `null`-on-failure contract.

## Risks

| Risk | Mitigation |
| --- | --- |
| Peer routing is mistaken for provider failover and gets merged into `callWithFailover` | Peers are never `LLMProvider`s; routing is a pre-step with its own module and its own tests. The failure mode is visible in review as a peer appearing in `buildFailoverList` |
| Counters reset on restart, so a restarted peer is briefly over budget | Stated, not hidden; budgets are conservative by default (`advisory`) and a restart is an operator-visible event. A durable counter is a consensus problem and is out of scope |
| Token budgets cannot be enforced | Named advisory-only rather than shipped as a knob that does nothing |
| Disk reconciliation adopts orphan files | Adoption is explicitly forbidden — an untracked file has no owner or hash |
| Quota eviction deletes a live asset | Eviction is opt-in, archive-first, and skips referenced assets; when nothing is evictable the write is refused |
| Offloading chat content leaks context to a peer | Consent gate + opaque assignment key + minimal payload; pinned by the security tests |
| Peer exhaustion causes a latency cliff as peers fill | Routing ranks by headroom and falls back to local; the dashboard surfaces the transition before users feel it |
| Performance accounting is wrong under concurrent measurement | Counters are per-receiving-process, so there is no cross-instance read-modify-write window; a `429` is authoritative immediately |

## Rollout

Federation is **off by default at every layer**, so an existing single-instance
deployment changes nothing:

- `config.federation.enabled` already defaults to `false` and gates route
  mounting entirely (`src/routes/federation.ts:4`). Nothing new mounts when it is
  false.
- A new `config.federation.workloadOffload` section defaults to
  `{ enabled: false }`. Off means the router is never consulted and every call
  site takes the local path — the pre-routing behaviour, already true of
  `ModelRouter` with the default `capability-match` policy.
- The new DB columns are additive with defaults (`workload_trust` default `0`),
  so the migration is safe on an existing database.
- The assignment matrix starts empty; an empty matrix is local-only.
- Rollout order for an operator: enable mesh federation (existing) → add a
  peer and pass the health probe → set budgets `advisory` → fill one matrix row
  for a stateless class (`embedding`) → observe the dashboard → only then allow
  a sticky `chat` row and raise budgets to `hard`.

## Dependencies

**Must exist first**

- The mesh peer registry and reservation lifecycle — built
  (`src/federation/coordinator.ts`, `src/federation/sharing.ts`).
- `src/crypto/byok.ts` encryption for peer tokens — built.
- `log_entries` audit writes — built.
- `admin.system` permission and the admin shell — built.

**Must exist before the routing work specifically**

- Nothing. Routing is a pre-step over an existing seam; it does not require the
  cross-instance scheduling in `epic-llm-request-scheduler.md`, and it does not
  wait for it.

**Deferred to other epics**

- Provider billing / metering beyond the circuit breaker
  (`epic-generation-flow-control.md`).
- Autoscaling off load signals (`epic-multi-instance-reconciliation.md`).
- Cross-instance scheduler persistence (`epic-llm-request-scheduler.md`).

## Bindings

| Artifact | Relationship | Rationale |
| --- | --- | --- |
| `.plan/epics/epic-mesh-federation-content-sharing.md` | **parent-of / extends** | Owns the `mesh_peers` registry, the reservation lifecycle, per-sender content keys, and `capacity_bytes` that this epic extends with workload metadata and budgets. Its Phase 3 "content federation quota" is the design ancestor; this epic splits that into a performance axis and a storage axis and states the accounting source of truth each one uses. |
| `.plan/epics/epic-federation-swarm-sync.md` | **sibling** | Fediverse/ActivityPub and CRDT swarm sync. Adjacent in name, disjoint in substance — no peer here is an ActivityPub actor and no CRDT merge is involved. |
| `.plan/epics/epic-instance-federation.md` | **sibling** | User-facing `@user@instance` handles and instance switching. Shares the word "instance"; its actor-map is identity, this epic's registry is workload capability. |
| `.plan/epics/epic-multi-instance-reconciliation.md` | **blocked-by (partial)** | Its health endpoints and auto-scaling triggers are the load signals this epic reads. Its leader-election and schema-drift work is *not* needed — this epic assumes nothing about who owns the schema. |
| `.plan/epics/epic-local-process-swarm.md` | **sibling** | `swarm-router` (cross-host) and `local-swarm-router` (in-host) are a process-supervision axis. This epic's same-host peers are a *network* concern on the loopback interface; the two are adjacent and must not be conflated. |
| `.plan/epics/epic-distributed-compute-sharing.md` | **sibling** | Contributor compute for strangers. Explicitly excluded here — a peer is an operator-trusted instance, not an anonymous donor. |
| `.plan/epics/epic-frontend-admin.md` | **parent-of (reuses)** | Owns the admin shell this epic's federation panel slots into. No new shell. |
| `.plan/epics/epic-llm-request-scheduler.md` | **blocked-by (partial)** | Owns the in-process `ResourceManager`. This epic keeps it local-only and routes around it; the cross-instance ceiling stays uncrossed. |
| `.plan/epics/epic-api-task-offloading.md` | **sibling** | Task queue / background workers / disk offload for long-running API work. Related in name, different mechanism: that one offloads to a queue inside one instance, this one to a peer. |
| `.plan/epics/epic-error-envelope.md` | **blocked-by** | Quota rejections must emit namespaced `error_code` strings peers can route on. |
| `.plan/epics/epic-database-backup-recovery.md` | **overlaps** | Peer-accepted assets change what a restore contains; §4 constrains storage so no second backup path is needed. |
| `.plan/epics/epic-analytics-observability.md` | **sibling** | Dashboard conventions; quota metrics are operational, not product analytics. |
| `.plan/tickets/TASK-federation-interconnect-peer-config.md` | **blocked-by (done)** | Landed the `federation` config section that owns admin trust and TLS overrides — the *other* half of the four peer representations named in §1. Its acceptance criteria define the per-peer trust shape this epic's `workload_trust` grant sits on top of. |
| `.plan/tickets/TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtls.md` | **blocked-by (open)** | Owns per-peer CA pinning and optional mTLS. This epic's same-host rule *skips* the SPKI pre-flight for loopback origins and requires a host-local token instead — that exemption must be reconciled with this ticket's trust model before shipping, and the two must not each assume the other covered it. |
| `.plan/tickets/TASK-federation-peer-audit-probe-zero-trust-cross-instance-verifi.md` | **overlaps** | Its zero-trust cross-instance probe is the natural home for the negative cases §6 requires (a peer claiming capabilities it cannot serve, exceeding an advertised budget). Reusing it beats a second probe. |
| `.plan/tickets/TASK-federation-defederation-admin-operations-peer-state-block-al.md` | **overlaps** | Block/allow and peer-state admin operations. A `suspended` or blocked peer must be excluded from routing, not just from content push — this epic's routing filter has to honour that state. |
| `.plan/tickets/TASK-federation-admin-ui-for-follows-blocklists-key-rotation.md` | **sibling** | The existing federation admin panel. This epic adds a *tab* to that panel rather than a second federation surface in the admin shell. |
| `.plan/matrix-federation-swarm.md` | **context** | The scored feature matrix behind `epic-federation-swarm-sync.md`; this epic is the workload-planning axis that matrix left open. |
| `.plan/matrix-federation-decisions.md` | **context** | Records that identity, authorization, and inbound moderation for federation are open decisions. This epic assumes a peer is already trusted and does not re-open them. |
| `.plan/matrix-protocol-chat-group-integration.md` | **context** | Establishes that chat-group work rides a protocol seam; the workload wire follows the same shape. |

## Linked Tasks

- `TASK-federation-peer-registry-workload-columns.md`
- `TASK-federation-peer-capability-advertisement.md`
- `TASK-federation-same-host-loopback-peer-auth.md`
- `TASK-federation-peer-health-and-load-registry.md`
- `TASK-federation-workload-routing-policy.md`
- `TASK-federation-peer-workload-wire-endpoints.md`
- `TASK-federation-peer-dispatch-compose-failover.md`
- `TASK-federation-performance-quota-enforcement.md`
- `TASK-federation-storage-quota-accounting.md`
- `TASK-federation-admin-peer-and-quota-routes.md`
- `TASK-federation-admin-usage-dashboard-ui.md`
- `TASK-federation-offload-two-instance-e2e.md`