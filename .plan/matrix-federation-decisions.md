<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Decision Matrix — Federation, Swarm & Decentralized Comms

Companion to `epic-federation-swarm-sync.md` (sections *Gaps & Open Questions*, *Extensions*, *Decision Register*) and `matrix-federation-swarm.md`. Tracks open architecture forks and policy choices discovered during strict review (2026-08-25). Each row names the decision, the candidate options, a recommendation, current status, what it blocks, and the linked ticket.

## Architecture forks (block Phase D / Phase C)

### C1 — CRDT engine

- **Options:** cr-sqlite (CRDT SQLite, stays on the `bun:sqlite` + Kysely stack) · Yjs (de-facto JS CRDT, rich shared types) · Loro (Rust+WASM, v1.0)
- **Recommendation:** cr-sqlite preferred — avoids a second state store and keeps migration/schema tooling intact; fall back to Yjs only for structures where cr-sqlite RGA coverage is insufficient (rich text). Decide before Phase D starts.
- **Status:** open · **Blocks:** Phase D (`FEAT-swarm-mode-reconciliation`)

### C2 — Causality clock

- **Options:** HLC (Hybrid Logical Clocks) · vector clocks
- **Recommendation:** HLC — total order, wall-clock friendly, easier to debug and store; vector clocks only if peer-count scaling demands pure causality.
- **Status:** open · **Blocks:** Phase D

### C3 — Swarm transport

- **Options:** libp2p · y-webrtc · Matrix-as-transport
- **Recommendation:** y-webrtc for the first cut (lowest setup, WebRTC peer sync); Matrix-as-transport only if the Matrix adapter (`TASK-matrix-integration.md`, planned not built) lands — do **not** hard-depend on it yet.
- **Status:** open · **Blocks:** Phase D
- **Note:** Matrix-as-transport creates a hard dependency on a planned-only adapter; prefer y-webrtc/libp2p to avoid stalling Phase D.

### C4 — Radicle scope

- **Options:** ticketize-only (promote Phase 5 to a tracked ticket) · build (full implementation)
- **Recommendation:** `FEAT-radicle-integration` AC implies build; clarify whether Phase C is ticketize-only or build. If build, thicken AC first (see G11).
- **Status:** open · **Blocks:** Phase C · **Linked:** `BUG-feat-radicle-integration-acceptance-criteria-too-thin`

### C13 — Same-host peer identity

- **Options:** a separate same-host subsystem · a peer with a loopback URL and a host-local auth mode
- **Recommendation:** the second. `link_kind` is *derived* from the origin host and never stored, so it cannot drift; the only persisted difference is `auth_mode`, where `host-local` requires a per-peer shared token (loopback is not remotely reachable, so TLS trust checks are unnecessary but a token is not — an open loopback port is not a trust boundary). Owned by `epic-federation-offload-quotas.md`.
- **Status:** decided (2026-10-18)

### C14 — Peer failover vs provider failover

- **Options:** register a peer as an `LLMProvider` · keep routing a pre-step outside the provider registry
- **Recommendation:** the second. One list means a peer failure trips a *vendor's* circuit breaker, offers a peer as a fallback for a chat whose sticky assignment says otherwise, and silently adds a remote candidate to the aux pipeline's deliberately single-element failover list. Each hop owns exactly one failover decision. Owned by `epic-federation-offload-quotas.md`.
- **Status:** decided (2026-10-18)

### C15 — Where counters live

- **Options:** DB-backed counters · in-process counters in the receiving instance
- **Recommendation:** in-process, keyed `(peer, workloadClass)`. The only truthful authority for "is this peer over its concurrency budget right now" is the process holding the in-flight requests; a DB counter would need a distributed reservation to be atomic across instances, which is consensus — explicitly out of scope. Consequence stated rather than hidden: counters reset on restart, so a restarted instance is permissive for one window. Budgets themselves are config and survive. Storage budgets use the opposite answer (DB is the source of truth, disk is reconciled against). Owned by `epic-federation-offload-quotas.md`.
- **Status:** decided (2026-10-18)

## Policy choices (map to gap tickets)

### C5 — Identity model

- **Options:** shadow local accounts · map-to-existing local users
- **Recommendation:** a verified-ownership proof issues a loop-lore session; foreign auth is never trusted. Shadow account by default; link to an existing user once proof is presented.
- **Status:** open · **Linked:** `BUG-federation-identity-mapping-to-local-users-undefined`

### C6 — Inbound gate-for-display

- **Options:** yes · no
- **Recommendation:** yes — inbound `Create`/`Announce` must pass the existing moderation service before persistence or display.
- **Status:** open · **Linked:** `BUG-inbound-federation-content-not-moderated-before-display`

### C7 — Federation authorization

- **Options:** owner · admin
- **Recommendation:** owner-or-admin, gated by a world-visibility precondition.
- **Status:** open · **Linked:** `BUG-federation-authorization-who-may-publish-an-actor-undefined`

### C8 — Actor-key lifecycle

- **Options:** rotate · static
- **Recommendation:** rotate; store the private key encrypted at rest per `epic-crypto.md` key-at-rest standard.
- **Status:** open · **Linked:** `BUG-activitypub-actor-signing-keys-and-rotation-undefined-no-cry`

### C9 — Backfill policy

- **Options:** full · none · since-last-seen
- **Recommendation:** paginated outbox backfill mirroring Mastodon/Lemmy; cap by count and age.
- **Decision:** paginated outbox backfill — newest-first `OrderedCollection` pages over a recent history window, capped by count and age. Recorded as the backfill acceptance criterion in `FEAT-activitypub-federation`; runtime behavior lands with that ticket (no outbox exists yet).
- **Status:** decided (2026-09-24) · **Linked:** `BUG-backfill-of-historical-posts-on-new-follower-unspecified`

### C10 — Leader + swarm arbitration

- **Options:** partition write domains · single-writer priority
- **Recommendation:** partition — swarm CRDT owns chat/lore/membership (conflict-free); leader owns schema/migration DDL. Non-overlapping surfaces so the two topologies never contend on the same row class.
- **Status:** open · **Linked:** `BUG-leader-and-swarm-topologies-lack-simultaneous-write-arbitrat`

### C11 — Signal activation

- **Options:** trigger · permanent-defer
- **Recommendation:** permanent-defer until `signald` stabilizes or an official SDK appears; keep behind the feature flag.
- **Status:** open · **Linked:** `BUG-signal-bridge-activation-trigger-undefined`

### C12 — Test harness

- **Options:** Fedify in-process fixtures · external instance
- **Recommendation:** Fedify in-process test fixtures for CI determinism; external Mastodon/Lemmy instance as an optional integration suite.
- **Status:** open · **Linked:** `BUG-federation-test-harness-needs-in-process-fixtures`
