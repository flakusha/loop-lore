# Feature Matrix — Federation, Decentralized Comms & Swarm Sync

> Assessment of potential new features across three areas requested for planning:
> **(A) Fediverse integration**, **(B) E-mail / alternative messaging**, **(C) Swarm mode & multi-instance sync**.
> Companion epic: `epic-federation-swarm-sync.md`. Tickets: `FEAT-activitypub-federation`, `FEAT-swarm-mode-reconciliation`, `FEAT-radicle-integration`, `FEAT-messaging-bridge-extensions`.

## Relationship to Other Matrices

This document is a **feature-evaluation matrix** for the three requested initiative areas
(fediverse, alternative messaging, swarm). It scores candidate features and identifies gaps;
it is intentionally NOT an integration map. Cross-system integration tracking for this
domain lives in the epic's formal `## Integration Points` section
(`epic-federation-swarm-sync.md`), which follows the standardized template defined in
`matrix-cross-mechanics.md`. The cross-mechanics matrix scopes strictly to RPG sub-systems
and delegates this domain to this file via its "Other Domain Matrices" section. The two
documents are complementary: this matrix decides *what* to build; integration points track
*how it connects*.

## Coverage Map (existing plan artifacts)

| Area | Already planned / ticketed | Gap (new work) |
|---|---|---|
| Fediverse | `epic-communications-integrations.md` Phase 1 (Matrix); `epic-anonymity-decentralization.md` Phase 5 (Radicle) | **ActivityPub / Lemmy / threadiverse** federation; Mastodon-compatible world feeds |
| E-mail / messaging | `TASK-matrix-integration.md`, `TASK-xmpp-integration.md`, `TASK-email-integration.md` (+ `TASK-email-modernization-exploration.md`), `epic-communications-integrations.md` Phases 1–4 | **Signal / Telegram / Discord bridges**; generic `ProtocolAdapter` bridge registry |
| Swarm / multi-instance | `epic-multi-instance-reconciliation.md` (leader-based single-writer reconciliation, schema drift, horizontal scaling) | **Swarm-mode CRDT multi-writer sync** (peer-to-peer, any node writes) |

## Feature Matrix

Columns: **M**aturity of the integration library · **Effort** (relative) · **Risk** · **Reuse** of existing plan coverage · **Disposition**.

| # | Feature | Protocol / Library (research) | M | Effort | Risk | Reuse | Disposition |
|---|---|---|---|---|---|---|---|
| A1 | Matrix homeserver bridge (chat ↔ room) | `matrix-bot-sdk` / `matrix-js-sdk` (TS); `pickle` (WASM, E2EE OOTB) | prod | high | med (E2EE) | `TASK-matrix-integration.md` | already planned |
| A2 | **ActivityPub / Lemmy threadiverse federation** | **Fedify** (TS ActivityPub, runs on Bun/Node/Deno) | prod lib | high | high (auth fetch, moderation) | none | **FEAT-activitypub-federation** |
| A3 | Mastodon-compatible world event feed (`Note`/`Article`) | Fedify `Note`/`Create`/`Announce` | prod lib | med | med | subset of A2 | fold into FEAT-activitypub-federation |
| A4 | **Radicle P2P collaborative editing** | `rad` CLI / `radicle-node` (content-addressed git, no servers) | beta (1.0) | med-high | med | `epic-anonymity-decentralization.md` Phase 5 | **FEAT-radicle-integration** (ticketize epic phase) |
| B1 | E-mail inbound (IMAP) + outbound (SMTP) | `imapflow` + `nodemailer` + `mailparser`/`postal-mime` | prod | med | low | `TASK-email-integration.md` | already planned |
| B2 | XMPP (MUC, OMEMO) | `@xmpp/client` + OMEMO | stable | med | low | `TASK-xmpp-integration.md` | already planned |
| B3 | **Telegram bridge** | `grammY` (Bot API) | prod | low-med | low | none (comms Phase 3 IM) | **FEAT-messaging-bridge-extensions** |
| B4 | **Discord bridge** | `discord.js` (Bot API) | prod | low-med | low | none (comms Phase 3 IM) | **FEAT-messaging-bridge-extensions** |
| B5 | **Signal bridge** | `signald` (daemon; no official SDK, self-hosted RPC, unofficial wrappers) | comm | high | high | none | **FEAT-messaging-bridge-extensions** (deferred) |
| B6 | **Generic bridge registry / `ProtocolAdapter` extensibility** | extend `epic-communications-integrations.md` abstraction | n/a | med | low | comms epic architecture | **FEAT-messaging-bridge-extensions** |
| C1 | Leader-based reconciliation (single-writer) | migration leadership + schema drift (Kysely/SQLite) | planned | high | med | `epic-multi-instance-reconciliation.md` | already planned (Epic 26) |
| C2 | **Swarm-mode CRDT multi-writer sync** | **Yjs** / **Loro** / **cr-sqlite** (CRDT SQLite) + `lib0` | prod (Yjs) / emerging (cr-sqlite) | high | high (RPG-state conflict semantics) | complements Epic 26 | **FEAT-swarm-mode-reconciliation** |
| C3 | Causality: vector / Hybrid Logical Clocks | HLC + vector clocks (e.g. `llm-sync` primitives) | prod pattern | med | med | part of C2 | **FEAT-swarm-mode-reconciliation** |
| C4 | Gossip / P2P transport for swarm | `libp2p` / `y-webrtc` / Matrix-as-transport | prod (y-webrtc) | med | med | `epic-transport-layer-expansion.md` | **FEAT-swarm-mode-reconciliation** |

## Research Notes (library maturity)

- **ActivityPub / Fedify** — Fedify is a maintained TypeScript ActivityPub framework that runs on Deno, Node, and Bun, and ships tutorials for threadiverse (Lemmy/Mastodon-compatible community platforms) and content-sharing (Pixelfed-style). It is used in production by projects such as Ghost and Hollo. ActivityPub federation is actor-model: `inbox`/`outbox`, `Follow`/`Accept`, `Create`/`Announce`, groups as actors. Reused directly for world/channel-as-actor federation.
- **Matrix** — `matrix-bot-sdk` is the high-level TS library for bots/appservices/bridges; `matrix-js-sdk` is the full client; `pickle` is a WASM TS SDK with E2EE out of the box. Already scoped as the primary chat federation transport.
- **Radicle** — P2P, content-addressed Git with no central server (`rad` CLI + `radicle-node`); suitable for offline-first collaborative editing of world/character definitions as repos. Beta maturity; node bindings are CLI/HTTP rather than first-class TS SDK.
- **E-mail** — `nodemailer` (SMTP send, mature), `imapflow` (modern maintained IMAP client), `mailparser` / `postal-mime` (parse). Mature, low-risk.
- **XMPP** — `@xmpp/client` with OMEMO for encryption; stable, well-understood.
- **CRDT (swarm)** — **Yjs** is the de-facto JS CRDT (fast, text + shared types, `lib0` encoding, `y-websocket`/`y-webrtc` transports). **Loro** (Rust+WASM, v1.0) is an emerging alternative with a clean API. **cr-sqlite** brings CRDTs to the SQLite layer — a natural fit for loop-lore's `bun:sqlite` + Kysely stack, enabling mergeable DB state without a separate CRDT store. **`llm-sync`** demonstrates CRDT + vector-clock coordination of distributed LLM-agent state without a central coordinator — directly analogous to a swarm of loop-lore instances coordinating story generation. Causality uses vector clocks / Hybrid Logical Clocks; gossip protocols give eventual consistency for open, untrusted swarms (vs RAFT's leader election).

## Recommendation Summary

1. **Build FEAT-activitypub-federation** — only fediverse surface with zero current coverage; Fedify removes most protocol boilerplate.
2. **Build FEAT-messaging-bridge-extensions** — low effort, high user value, extends (not duplicates) comms epic; Signal deferred (no official SDK; self-hosted daemon + unofficial wrapper required).
3. **Ticketize FEAT-radicle-integration** — promote an existing epic phase into a tracked ticket.
4. **Build FEAT-swarm-mode-reconciliation** — highest risk/effort; sequence after Epic 26's leader-based path is stable; consider `cr-sqlite` for minimal stack divergence.
