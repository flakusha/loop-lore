# FEAT-swarm-mode-reconciliation: Swarm-mode CRDT multi-instance reconciliation

## What

Add a **swarm mode** where multiple loop-lore instances share authoritative RPG state as peers — any node may write — using Conflict-Free Replicated Data Types (CRDTs) with vector / Hybrid Logical Clock causality and gossip transport. This complements (does not replace) the leader-based single-writer reconciliation in `epic-multi-instance-reconciliation.md` (Epic 26).

## Why

Epic 26 reconciles instances through migration leadership and schema-drift detection — a single-writer, eventually-consistent topology. It does not support true peer swarms where instances join/leave freely and all may write concurrently (e.g. a co-op of instances co-authoring one world, or a swarm of instances coordinating story generation). CRDTs make concurrent merges deterministic and conflict-free without a coordinator. No plan or ticket currently covers swarm-mode sync.

## Current State

- `epic-multi-instance-reconciliation.md` (Epic 26) covers migration leadership, schema-drift detection, optional cross-instance real-time, and horizontal scaling — all leader/single-writer oriented.
- No CRDT, vector-clock, or gossip code exists.
- Research: **Yjs** is the de-facto JS CRDT (fast; `lib0` encoding; `y-websocket`/`y-webrtc` transports). **cr-sqlite** brings CRDTs to the SQLite layer — a natural fit for loop-lore's `bun:sqlite` + Kysely stack, avoiding a second state store. **Loro** (Rust+WASM, v1.0) is an emerging alternative. **`llm-sync`** demonstrates CRDT + vector-clock coordination of distributed LLM-agent state without a central coordinator — directly analogous to a swarm of loop-lore instances.

## Acceptance Criteria

- Shared state (chat branches, lore, world/character state) modeled as CRDTs; concurrent edits from two partitioned nodes merge deterministically with no coordinator.
- Causality tracked via vector clocks / Hybrid Logical Clocks; merge order is commutative and idempotent.
- Peer discovery + sync over a gossip transport (`y-webrtc` / `libp2p`, or Matrix-as-transport).
- New nodes converge to current state on join; departed nodes re-converge on return.
- Interoperates with Epic 26: the same store reconciles under both leader and swarm topologies without corruption.
- Signature-checked merges and replay protection for the untrusted-peer model.

## Implementation Notes

- Prefer **cr-sqlite** to stay on the SQLite stack; fall back to **Yjs** for rich shared types if CRDT-SQLite coverage is insufficient for the required structures.
- `SwarmReconciler` wraps CRDT-backed state beneath the existing store access layer; expose the same read/write surface Epic 26 uses.
- Conflict policy: LWW-Register for scalar world fields, OR-Set for membership/lore entries, RGA/text-CRDT for message bodies.
- Transport: start with `y-webrtc` (or libp2p) for peer sync; document Matrix-as-transport as an alternative.
- Sequence after Epic 26's leader path is stable (swarm is the riskier, later phase).

## Dependencies

- `epic-multi-instance-reconciliation.md` (Epic 26 — store schema, reconciliation framing)
- `epic-federation-swarm-sync.md` (this epic)
- `epic-transport-layer-expansion.md` (WebSocket/WebTransport for gossip)
- CRDT library (cr-sqlite or Yjs)
