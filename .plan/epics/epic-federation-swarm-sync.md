# Epic: Federation, Swarm Sync & Decentralized Comms

## Summary

A consolidation roadmap for loop-lore's decentralized surface. It ties together three requested initiative areas — **fediverse integration**, **e-mail / alternative messaging**, and **swarm-mode multi-instance sync** — and clearly partitions them from work already planned in `epic-communications-integrations.md`, `epic-anonymity-decentralization.md`, and `epic-multi-instance-reconciliation.md`.

The epic adds four net-new, ticketed workstreams (`FEAT-activitypub-federation`, `FEAT-messaging-bridge-extensions`, `FEAT-radicle-integration`, `FEAT-swarm-mode-reconciliation`) and explicitly references the existing epics it builds on rather than re-scoping them.

## Motivation

loop-lore is a local-first RPG chat platform. Decentralization has three distinct axes that have drifted across separate planning docs:

1. **Fediverse** — let worlds/channels/characters participate in the ActivityPub network (follow across instances, Lemmy-style communities), beyond the already-planned Matrix bridge.
2. **Alternative messaging** — let users reach loop-lore through e-mail and IM networks, beyond the already-planned Matrix/XMPP/Email adapters.
3. **Swarm** — let multiple loop-lore instances share authoritative state as peers (any node may write), beyond the already-planned leader-based single-writer reconciliation (Epic 26).

A single epic prevents duplicate `ProtocolAdapter` designs and gives a coherent sequencing order.

## Current State Assessment

- **Covered, do not re-scope:** Matrix (`TASK-matrix-integration.md`), XMPP (`TASK-xmpp-integration.md`), E-mail (`TASK-email-integration.md` + `TASK-email-modernization-exploration.md`) — all under `epic-communications-integrations.md`. Radicle + mesh under `epic-anonymity-decentralization.md`. Leader-based reconciliation under `epic-multi-instance-reconciliation.md` (Epic 26).
- **Uncovered gaps:** ActivityPub/Lemmy federation (no plan, no ticket); Signal/Telegram/Discord bridges (comms epic Phase 3 "Instant Messaging" names IM but has no ticket for these transports); Radicle has an epic phase but no trackable ticket; swarm-mode CRDT multi-writer sync has no plan and no ticket.

## Scope (this epic adds)

- ActivityPub / Lemmy / threadiverse federation of worlds, channels, and characters as fediverse actors (`FEAT-activitypub-federation`).
- A generic bridge registry extending the comms-epic `ProtocolAdapter` abstraction, plus Telegram/Discord bridges and a deferred Signal bridge (`FEAT-messaging-bridge-extensions`).
- Promotion of the Radicle collaborative-editing phase into a tracked ticket (`FEAT-radicle-integration`).
- Swarm-mode CRDT multi-writer reconciliation layered on top of Epic 26 (`FEAT-swarm-mode-reconciliation`).

## Feature Matrix

Full scored matrix: `../matrix-federation-swarm.md`.

Condensed disposition:

| Workstream | Disposition |
|---|---|
| Matrix / XMPP / E-mail | already planned — out of scope here |
| ActivityPub / Lemmy | **FEAT-activitypub-federation (new)** |
| Telegram / Discord / Signal bridges + registry | **FEAT-messaging-bridge-extensions (new)** |
| Radicle collaborative editing | **FEAT-radicle-integration (ticketize existing phase)** |
| Swarm CRDT multi-writer sync | **FEAT-swarm-mode-reconciliation (new, extends Epic 26)** |

## Architecture

Reuse the `ProtocolAdapter` / `MessageBridge` / `EncryptionProvider` seams already defined in `epic-communications-integrations.md`. New seams introduced by this epic:

- **Fediverse adapter** — `ActivityPubAdapter implements ProtocolAdapter`: WebFinger resolution, HTTP-signature-verified inbox/outbox, object persistence in the existing Kysely store. Worlds/Channels model as `Group` actors; messages/events as `Note`/`Article`.
- **Bridge registry** — `BridgeRegistry` with capability negotiation; new transports (Telegram/Discord/Signal) register without touching core routing.
- **Swarm layer** — `SwarmReconciler` wraps CRDT-backed state (Yjs / cr-sqlite). Conflict-free merge semantics for chat branches, lore, and world state; vector / Hybrid Logical Clocks for causality; gossip transport (`y-webrtc` / `libp2p`, or Matrix-as-transport) for peer discovery and sync. Operates beneath / alongside Epic 26's leader-based reconciliation.

## Phases

### Phase A — ActivityPub / Lemmy Fediverse Federation (FEAT-activitypub-federation)

World/Channel/Character as actors; follow/accept; `Create`/`Announce` of messages and world events; Lemmy-compatible threadiverse communities; Mastodon-compatible note feeds. Federation security: authorized fetch, signature verification, and reuse of the existing NSFW/moderation gate before federating outbound content.

### Phase B — Messaging Bridge Registry & Extended Bridges (FEAT-messaging-bridge-extensions)

Extract `BridgeRegistry` from the comms-epic `ProtocolAdapter`. Implement Telegram (`grammY`) and Discord (`discord.js`) adapters (Bot-API, low risk). Defer Signal (`signald`, no bot API, high risk) behind a feature flag.

### Phase C — Radicle P2P Collaborative Editing (FEAT-radicle-integration)

Promote `epic-anonymity-decentralization.md` Phase 5 into a tracked ticket: `RadicleClient` syncing world/character definitions as content-addressed git repos; offline-first editing; merge-on-pull.

### Phase D — Swarm-Mode CRDT Reconciliation (FEAT-swarm-mode-reconciliation)

Multi-writer peer sync. Model shared RPG state as CRDTs (prefer `cr-sqlite` to stay on the SQLite stack, or Yjs for rich shared types). Add HLC/vector-clock causality and a gossip transport. Complements — does not replace — Epic 26's leader-based path; the two reconcile the same store via different topologies.

## Cross-Cutting Concerns

- **Identity & auth** — federation introduces external identities; map fediverse/IM actors to loop-lore's existing auth/session model without trusting foreign auth.
- **Moderation / NSFW** — every outbound federation path must route through the existing NSFW + moderation gate; inbound must support defederation/blocklists.
- **Encryption** — reuse `EncryptionProvider` seam; E2EE for Matrix (OMEMO/pickle), PGP for e-mail, OMEMO for XMPP.

## Security Considerations

- ActivityPub: enforce HTTP-signature verification, authorized fetch, and object ownership checks; prevent forged `Announce`/fake-actor injection.
- Swarm: untrusted-peer model requires signature-checked merges and replay protection; gossip must resist poison objects.
- Bridge registry: capability scoping so a compromised bridge cannot escalate beyond its granted channels.

## Dependencies

- `epic-communications-integrations.md` (adapter seams, Matrix/XMPP/Email).
- `epic-anonymity-decentralization.md` (Radicle phase, mesh transport).
- `epic-multi-instance-reconciliation.md` (Epic 26 — leader-based reconciliation, store schema).
- `epic-social-hub.md` (social graph that federated actors attach to).

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| --- | --- | --- |
| Communications Integrations | `ProtocolAdapter` / `MessageBridge` / `EncryptionProvider` seams | Fediverse adapter + bridge registry extend these seams |
| Anonymity & Decentralization | Radicle phase, mesh transport | Radicle collaborative editing; offline-first P2P |
| Multi-Instance Reconciliation (Epic 26) | Store schema, reconciliation framing | Swarm CRDT reconciles the same store as leader path |
| Social Hub | Social graph for federated actors | Fediverse actors attach to social graph |
| Transport Layer Expansion | WebSocket / WebTransport | Gossip transport for swarm sync |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| --- | --- | --- |
| (none yet) | — | Consumes the above; no dependents registered yet |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| --- | --- | --- |
| `ProtocolAdapter` | Communications Integrations | Unified adapter interface for fediverse + bridges |
| CRDT-backed store state | Multi-Instance Reconciliation | Shared RPG state merges under leader + swarm topologies |
| Actor model mapping | Social Hub | Federated identity resolution |

### Cross-System Events

| Event | Direction | Purpose |
| --- | --- | --- |
| federation.inbox | subscribes | Receive signed ActivityPub activities |
| federation.follow | emits / subscribes | World/channel follow across instances |
| bridge.message | emits / subscribes | Message across Telegram/Discord/Signal bridges |
| swarm.merge | emits | CRDT state merged from peer |

## Testing Strategy

- Federation: fediverse test harness (local Mastodon/Lemmy or Fedify test instances) asserting inbox/outbox round-trips and signature rejection.
- Bridges: adapter contract tests against the `ProtocolAdapter` interface; mock Bot-API servers for Telegram/Discord.
- Swarm: CRDT convergence tests (partition + heal, concurrent writes merge deterministically); HLC ordering invariants; Epic 26 interop (leader + swarm topologies reconcile the same store).

## References

- Fedify (ActivityPub TS framework, Bun/Node/Deno): fedify.dev — threadiverse & content-sharing tutorials; used in production by Ghost, Hollo.
- Matrix SDKs: matrix-bot-sdk, matrix-js-sdk, pickle (WASM, E2EE).
- CRDT: Yjs, Loro (Rust+WASM), cr-sqlite (CRDT SQLite), `llm-sync` (CRDT + vector clocks for distributed LLM-agent state).
- E-mail: nodemailer, imapflow, mailparser / postal-mime.
- XMPP: @xmpp/client + OMEMO.

## Related Epics

- `epic-communications-integrations.md` (Matrix/XMPP/Email/IM — already planned)
- `epic-anonymity-decentralization.md` (Radicle, Tor/I2P mesh — already planned)
- `epic-multi-instance-reconciliation.md` (Epic 26 — leader-based reconciliation — already planned)
- `epic-social-hub.md` (social graph for federated actors)
- `epic-transport-layer-expansion.md` (HTTP/2/3, WebSocket, WebTransport — swarm transport)

## Scope Boundary

In scope: ActivityPub federation, bridge registry + Telegram/Discord/Signal, Radicle ticketization, swarm CRDT sync.
Out of scope (owned by other epics): Matrix/XMPP/Email core adapters, Tor/I2P hidden services, mesh networking transport, leader-based single-writer reconciliation mechanics.

## Linked Tasks

- `FEAT-activitypub-federation`
- `FEAT-swarm-mode-reconciliation`
- `FEAT-radicle-integration`
- `FEAT-messaging-bridge-extensions`
