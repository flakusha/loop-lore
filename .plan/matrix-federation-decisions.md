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
- **Status:** open · **Linked:** `BUG-backfill-of-historical-posts-on-new-follower-unspecified`

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
