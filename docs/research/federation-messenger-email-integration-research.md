<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Research: Federation, Messenger & Email Integration — Build vs Adopt

**Date:** 2026-10-02
**Scope:** Can other open-source applications' programmable APIs be adopted as opt-in plugins in loop-lore (connectivity + message exchange), or is ground-up implementation required? Answer is per transport family.
**Companion specs:** [`docs/spec/integrations-architecture.md`](../spec/integrations-architecture.md), [`docs/spec/federation-email-channel.md`](../spec/federation-email-channel.md), [`docs/spec/federation-messenger-channels.md`](../spec/federation-messenger-channels.md)

---

## 1. Executive summary

**Answer to the central question: adopt, don't build — per family, not globally.** Every transport family examined has a mature open-source component that loop-lore can load in-process (or run as a sidecar for Signal/Radible/interop daemons). Ground-up work is required only for the loop-lore-specific seams that no external library provides: federated identity mapping, the moderation/NSFW gate on inbound content, the chat ↔ group-chat ↔ blog actor/thread model, adapter secret storage, the integration config surface, and the plugin-host contract. The protocol libraries are commodities; the value and the risk live in the seams.

The single implemented seam today is `ProtocolAdapter` (`src/integrations/adapter.ts`). Everything else — `MessageBridge`, `EncryptionProvider`, `BridgeRegistry`, all adapters — is planning-only. The recommended sequence lands the shared seams + config + secret storage first, then email (unblocks auth OTP), then Matrix (highest leverage: E2EE + appservice bridges to Discord/Slack/IRC), then the remaining chat-room protocols, then ActivityPub via Fedify, with Signal permanently deferred and swarm CRDT after the leader-based path.

---

## 2. What exists today (in-repo, verified)

### 2.1 Implemented

| Surface | Location | State |
|---|---|---|
| Mesh federation modules (PSK crypto, HLC clock, peer registry, gossip, fan-out, delivery, sharing, negotiation, envelope, duplication) | `src/federation/*.ts` (14 modules) | Implemented (`epic-mesh-federation-content-sharing.md` Done) |
| `ProtocolAdapter` + capability interfaces (`ChannelCapable`, `PresenceCapable`, `ReactionCapable`, `MessageEditCapable`) + `ADAPTER_CAPABILITIES` registry | `src/integrations/adapter.ts` | Implemented + unit-tested (`adapter.test.ts`) |
| Byte transport (`ProtocolHandler`, WS/H2/HTTP1) | `src/transport/` | Implemented |
| NodeInfo 2.1 + `/.well-known/nodeinfo` + `/api/instance-state` (opt-in via `config.federation.enabled`, default off) | `src/routes/federation.ts` | Implemented |
| Plugin runtime: manifest, loader, registry, 6 extension points, `onLoad`/`onUnload`, event bus dispatch (wired to chat lifecycle), tool executor, config merge, mount-point lookup, admin enable/disable API | `src/plugins/`, `src/routes/plugins.ts` | Implemented (registry API + event bus wired; see §2.3 for gaps) |
| v1 REST surfaces + OpenAPI | `src/routes/v1/` (`openapi.ts`) | Implemented |
| Blog system (posts, comments, follows, tags) | `src/db/schema-blog.ts`, `src/routes/blog/` | Implemented; comments now threaded (`src/db/migrations/001_init.ts` + `src/db/schema-blog.ts`) |
| Build identity hash + `/.well-known/loop-lore/build-id` | `src/build/identity.ts`, `src/routes/build-id.ts` | Implemented |

### 2.2 Planning-only (no code)

| Seam | Planned location | Tracked by |
|---|---|---|
| `MessageBridge` (chat ↔ adapter routing) | `src/integrations/bridge.ts` | `TASK-integrations-shared-seams-encryptionprovider-messagebridge-b` |
| `EncryptionProvider` (Olm/Megolm, OMEMO, PGP) | `src/integrations/encryption.ts` | same |
| `BridgeRegistry` (capability-negotiated adapter registry) | `src/integrations/` | same + `FEAT-messaging-bridge-extensions` |
| Email adapter (IMAP/SMTP/PGP) | `src/integrations/email/` | `TASK-email-integration`, `TASK-email-deps-as-opt-in-lazy-import-nodemailer-imapflow-openpgp` |
| Matrix adapter (client SDK, E2EE, appservice bridges) | `src/integrations/matrix/` | `TASK-matrix-integration` |
| XMPP adapter (SASL, OMEMO, MUC, Jingle) | `src/integrations/xmpp/` | `TASK-xmpp-integration` |
| IM adapters (Telegram/Discord/Signal) | `src/integrations/im/` | `FEAT-messaging-bridge-extensions` |
| ActivityPub federation (Fedify) | `src/integrations/activitypub/` | `FEAT-activitypub-federation` |
| Swarm CRDT reconciliation | `src/swarm/` | `FEAT-swarm-mode-reconciliation` |
| Instance switching backend (handles, actor map) | `src/federation/instances.ts`, `handles.ts`, `actor-map.ts` | `TASK-instance-switching-backend-instances-handles-actor-map` |
| MCP bridge | workspace | `TASK-workspace-mcp-bridge-on-openclaw-serve-registry-pattern` |

### 2.3 Config surface

Zero config keys exist for email, IMAP, SMTP, Matrix, XMPP, webhooks, or any messenger. `configs/config.example.toml` has only `[transport]` and `[generation.providers]` (the LLM/SD provider abstraction — the precedent for integration config). `configs/env.example.yaml` has only `MESH_PSK` under federation. Config sections follow a triple pattern: `src/config/sections/<ns>.ts` (schema + defaults + meta class) with a JSON Schema mirror in `schemas/config.<ns>.schema.json` (e.g. `schemas/config.transport.schema.json`). New integration keys register in both places.

### 2.4 Plugin-host gaps (for integration plugins)

The plugin runtime provides: manifest with `onLoad`/`onUnload`, 6 extension points (`routes`, `tools`, `agentRoles`, `uiComponents`, `eventHandlers`, `migrations`), event-bus dispatch wired to chat lifecycle (`chat.created/deleted/archived`, `message.variant.created`), tool executor with timeout, config merge, mount-point lookup, and an admin enable/disable API (`GET /api/plugins`, `POST /api/plugins/:name/enable|disable`).

Missing for integration plugins specifically: declared-permission grants (scopes), egress allowlist, secret-access tokens, background timer/cron registration, and a UI-component serving route (`GET /api/plugins/ui-components` — the lookup exists, no route serves it). `PluginContext` (`src/plugins/types.ts`) has no `registerTimer`, `registerWebhook`, or scope/secret fields. Sandboxing (WASM/Firecracker) and network/file allowlists are aspirational per `docs/spec/plugin-system.md`.

---

## 3. Landscape by family

Licenses verified against upstream repos/npm 2026-10-02; no unverified claims remain.

### 3.1 Email (IMAP / SMTP / PGP / JMAP)

| Component | License | Notes |
|---|---|---|
| [imapflow](https://github.com/postalsys/imapflow) | MIT | Modern promise-based IMAP client, built-in types, Node 20+ |
| [nodemailer](https://nodemailer.com/) | MIT-0 | SMTP send; MIT-0 is permissive (no attribution requirement) |
| [OpenPGP.js](https://github.com/openpgpjs/openpgpjs) | LGPL-3.0 | Pure-JS PGP; no native addon |
| [postal-mime](https://github.com/postalsys/postal-mime) | MIT-0 | MIME parser (imapflow companion) |
| JMAP (RFC 8620) | — | Alternative to IMAP; no mature TS client — ground-up if chosen |

Email is the easiest adoption case: all libraries are pure JS/TS with permissive licenses, lazy-importable, no native addons, no separate process. The deciding factors are operational, not technical: inbound spam/abuse handling, deliverability (SPF/DKIM/DMARC) when sending from your own domain, and address-change re-verification (cross-link `epic-auth-channel-provisioning.md` F5: an e-mail address change must re-challenge on the new address before it gains recovery power).

### 3.2 Matrix

| Component | License | Notes |
|---|---|---|
| [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk) | Apache-2.0 | Client-Server SDK; E2EE via Olm/Megolm |
| [@matrix-org/olm](https://github.com/matrix-org/olm) | Apache-2.0 | Olm/Megolm — WASM build available, no native addon required |
| [matrix-bot-sdk](https://github.com/turt2live/matrix-bot-sdk) | MIT | Bot SDK (alternative to js-sdk for bot-mode) |
| matrix-appservice-discord / -slack / -irc | Apache-2.0 | Appservice bridges (external processes) |
| Synapse / Dendrite (homeservers) | Apache-2.0 | Only needed if loop-lore acts as a homeserver; as a client/appservice, the admin's homeserver suffices |

Matrix is in-process: matrix-js-sdk is pure JS, Olm ships as WASM. E2EE key custody: the host holds Megolm room keys and Olm device keys (it can read plaintext of rooms it participates in); cross-signing + key backup is the hard part and is ground-up glue on top of the SDK. Matrix appservice registration is client-side registration against an external homeserver — no homeserver required in loop-lore.

### 3.3 XMPP

| Component | License | Notes |
|---|---|---|
| [@xmpp/client](https://github.com/xmppjs/xmpp.js) | ISC | xmpp.js — modern TS XMPP client |
| OMEMO (XEP-0384) | GPL-3.0 (libsignal-protocol-javascript) | Pure-JS implementations exist (e.g. via libsignal-protocol) |
| MUC (XEP-0045) | — | Server-side; requires an external XMPP server for federation |
| Jingle (XEP-0166) | — | File transfer; HTTP Upload (XEP-0363) is the practical path |

XMPP is in-process (pure JS). The deciding factor is server-side: MUC, federation, and message archives require an external XMPP server (Prosody/ejabberd); loop-lore is a client. OMEMO gives E2EE with device keys + TOFU trust.

### 3.4 IRC

RFC 1459/2812. Trivial line protocol — in-process, no library strictly required (a minimal socket client is ground-up but tiny; `irc-framework` is a MIT option). No E2EE, no native auth; persistence requires a bouncer or relay logging. Maps to group-chat (channels) + chat (PMs) per `matrix-protocol-chat-group-integration.md`.

### 3.5 Telegram / Discord / Slack / Mattermost / Rocket.Chat / Zulip

| Component | License | Notes |
|---|---|---|
| [grammY](https://github.com/grammyjs/grammY) | MIT | Telegram Bot API framework |
| [discord.js](https://github.com/discordjs/discord.js) | Apache-2.0 | Discord Bot API |
| Slack / Mattermost / Rocket.Chat / Zulip | — | All expose Bot/Webhook APIs; no first-class TS SDK required — thin REST clients suffice |
| [matterbridge](https://github.com/42wim/matterbridge) | Apache-2.0 | Go daemon bridging 20+ protocols incl. all of the above + Matrix/IRC/XMPP/WhatsApp |

Telegram and Discord are in-process (Bot API over HTTPS/WSS). Slack/Mattermost/Rocket.Chat/Zulip need only thin REST webhook clients. **Deciding factor:** ToS risk — Discord and Telegram prohibit user-account (self) automation; bot accounts are the supported path. Matterbridge is the adopt-instead-of-build option when one daemon should fan out to many networks at once (it is a separate process with a REST API).

### 3.6 Signal / SimpleX / WhatsApp

| Component | License | Notes |
|---|---|---|
| [signald](https://gitlab.com/signald/signald) | GPL-3.0 | Signal daemon; no official SDK; unofficial RPC wrappers |
| SimpleX | — | Bot API via local CLI WebSockets + official TS SDK (`simplex-chat`); adoption = run the SimpleX Chat CLI as a local daemon |
| [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) | Apache-2.0 | Unofficial Web-protocol; breakage-prone, ToS risk |

Signal: **no bot API, no official SDK** — the only adoption path is the external signald daemon (GPL-3.0) or permanent deferral. `matrix-federation-decisions.md` C11 recommends permanent-defer until signald stabilizes or an official SDK appears. SimpleX has a bot API (official TypeScript SDK over the CLI WebSockets API), but adopting it still means running the SimpleX Chat CLI as a local daemon. WhatsApp Web is unofficial and ToS-risky — experimental only. These are the families where "adopt" means "run someone else's daemon," and the honest verdict is defer.

### 3.7 Nostr

| Component | License | Notes |
|---|---|---|
| [nostr-tools](https://github.com/nbd-wtf/nostr-tools) | Unlicense | Relay WebSocket client + NIP implementations |
| NIP-28 (public chat) / NIP-29 (groups) | — | kind 40/41/42 channel events; NIP-29 is the recommended successor |

Nostr is in-process (relay WebSocket, pure JS). It is the lightweight fediverse axis: no servers to run, no E2EE for public chat (NIP-04 DM is deprecated; NIP-44 is the E2EE variant). Tracked as `IDEA-consider-nostr-as-a-lightweight-fediverse-axis`.

### 3.8 ActivityPub / fediverse (incl. Fedify)

| Component | License | Notes |
|---|---|---|
| [Fedify](https://github.com/fedify-dev/fedify) | MIT | TS ActivityPub server framework; runs on Node/Deno/**Bun**; used in production by Ghost, Hollo |
| Mastodon / Lemmy | AGPL-3.0 | Reference implementations; loop-lore is a peer, not a server |
| [Hollo](https://github.com/fedify-dev/hollo) | AGPL-3.0 | Single-user Fedify microblog — closest reference architecture |

Fedify is the clear adopt choice: MIT, Bun-compatible, handles federation/signatures/discovery/activity vocabulary/delivery. **Deciding factors:** (1) S2S requires a publicly reachable HTTPS origin with a stable domain — infra requirement; (2) E2EE does not exist in ActivityPub — the host reads all plaintext; (3) actor-key custody + rotation is ground-up (`BUG-activitypub-actor-signing-keys-and-rotation-undefined-no-cry`); (4) the fediverse primitive is the **blog system** (posts + threaded comments + follows), not the World/Channel/Character actor model (`matrix-protocol-chat-group-integration.md`, `BUG-activitypub-federation-does-not-leverage-the-blog-system-lem`).

### 3.9 P2P (libp2p / Radicle / SSB / Veilid)

| Component | License | Notes |
|---|---|---|
| [libp2p](https://github.com/libp2p/js-libp2p) | MIT/Apache-2.0 | Modular P2P stack; in-process |
| [cr-sqlite](https://github.com/vlcn-io/cr-sqlite) | MIT | CRDTs on SQLite — stays on the `bun:sqlite` stack |
| [Yjs](https://github.com/yjs/yjs) | MIT | De-facto JS CRDT; `y-webrtc` transport |
| Radicle (`rad` CLI) | GPL-3.0 | Content-addressed git P2P; external CLI |
| SSB / Veilid | MIT (SSB) / MPL-2.0 (Veilid) | Niche; no adoption pull for loop-lore's shape |

Swarm transport: libp2p or y-webrtc in-process (C3 in `matrix-federation-decisions.md` recommends y-webrtc first). CRDT engine: cr-sqlite preferred to stay on SQLite (C1). Radicle is an external CLI for collaborative editing (`FEAT-radicle-integration`).

### 3.10 Interop daemons (Matterbridge / slidge / mautrix / biboumi)

| Component | License | Notes |
|---|---|---|
| [matterbridge](https://github.com/42wim/matterbridge) | Apache-2.0 | Go; 20+ protocols; REST API; single config file |
| [slidge](https://codeberg.org/slidge/slidge) | AGPL-3.0-or-later | Python XMPP puppeting gateway library |
| mautrix-* (Go) | AGPL-3.0 | Matrix bridges (WhatsApp/Telegram/Signal/Discord/…) |
| [biboumi](https://biboumi.louiz.org/) | Zlib | C++ IRC/XMPP gateway |

These are **external daemons with REST/XMPP interfaces** — the adopt path when loop-lore should not embed a protocol natively. Matterbridge is the broadest (one daemon, many networks); mautrix is the Matrix-centric family; slidge/biboumi are XMPP-centric. All are separate processes; loop-lore talks to them over their HTTP APIs.

### 3.11 Identity (OIDC / DIDComm / WebFinger)

| Component | License | Notes |
|---|---|---|
| WebFinger (RFC 7033) | — | Trivial — ground-up (a `/.well-known/webfinger` route) |
| OIDC RP | — | Adopt a small RP library (e.g. `openid-client`, MIT) or ground-up minimal; loop-lore is RP-only, never IdP (`epic-auth-channel-provisioning.md` F8) |
| DIDComm | — | Adopt a DIDComm library if DID identity is pursued; otherwise defer |

**Trust boundary (C5, `matrix-federation-decisions.md`):** a verified-ownership proof issues a loop-lore session; foreign auth is never trusted. Shadow account by default; link to an existing user once proof is presented. The mapping store (`federated_identities`, `actor_mappings`) is ground-up (`BUG-federation-identity-mapping-to-local-users-undefined`, `TASK-instance-switching-backend-instances-handles-actor-map`).

### 3.12 MCP as a connectivity bridge

The Model Context Protocol is the adopt path for external-tool connectivity: loop-lore exposes MCP tools/resources (its existing tool registry maps directly) and consumes MCP servers for external services. `TASK-workspace-mcp-bridge-on-openclaw-serve-registry-pattern` tracks the design (OpenClaw serve/registry pattern). MCP is in-process (SDK) and complements — does not replace — the message transports.

---

## 4. Per-family verdicts + decision table

Verdicts: **(A)** in-process library, lazy-loaded by opt-in plugin · **(B)** external daemon/bridge + its API · **(C)** ground-up.

| Family | Verdict | Adopt component (license) | Interface | In-process? | Effort | Risk | Ground-up remainder |
|---|---|---|---|---|---|---|---|
| Email (IMAP/SMTP/PGP) | **A** | imapflow (MIT), nodemailer (MIT-0), OpenPGP.js (LGPL-3.0) | IMAP fetch + SMTP send + PGP ops | Yes | Med | Spam/abuse inbound; deliverability (SPF/DKIM/DMARC) if own MX; address re-verification | Threading (Message-ID/References), spam gate, mailbox mapping to chats |
| Matrix | **A** | matrix-js-sdk (Apache-2.0) + Olm WASM (Apache-2.0) | Client-Server API + Olm/Megolm | Yes | High | E2EE key custody (cross-signing, key backup); appservice registration is per-homeserver | Key backup/verification UX; room↔chat mapping; appservice config |
| XMPP | **A** | @xmpp/client (ISC) + OMEMO | XMPP stream + MUC + Jingle | Yes | Med | External XMPP server required for MUC/federation | OMEMO device-key trust UI; MUC↔group-chat mapping |
| IRC | **A** | irc-framework (MIT) or minimal ground-up client | RFC 1459/2812 socket | Yes | Low | No E2EE, no auth; bouncer for persistence | Channel↔group-chat mapping; relay logging |
| Telegram | **A** | grammY (MIT) | Bot API (HTTPS) | Yes | Low–Med | ToS: bot accounts only | Bot↔chat mapping; webhook or long-poll |
| Discord | **A** | discord.js (Apache-2.0) | Bot API (HTTPS/WSS) | Yes | Low–Med | ToS: bot accounts only | Guild/channel↔group-chat mapping |
| Slack/Mattermost/Rocket.Chat/Zulip | **A** (thin) or **B** (matterbridge) | Bot/Webhook REST APIs; matterbridge (Apache-2.0) as daemon | REST webhooks | Yes (thin) / No (daemon) | Low | ToS: bot tokens only | Thin REST clients; or matterbridge config |
| Signal | **B** (defer) | signald (GPL-3.0) | daemon RPC | No | High | No official SDK; GPL-3.0; C11 says permanent-defer | Nothing until activated |
| SimpleX / WhatsApp | **B** (defer) | — | — | No | High | Local-daemon bot API (SimpleX); ToS risk (WhatsApp) | Nothing |
| Nostr | **A** | nostr-tools (Unlicense) | Relay WebSocket (NIP-28/29) | Yes | Low | No E2EE on public chat; relay trust | Channel↔group-chat mapping; NIP-29 group handling |
| ActivityPub/fediverse | **A** | Fedify (MIT) | ActivityPub S2S + WebFinger + NodeInfo | Yes | High | Public HTTPS origin + stable domain required; no E2EE; actor-key custody | Inbox/outbox storage, actor model (blog primitive), HTTP-signature glue, moderation gate, key rotation |
| P2P swarm | **A** | y-webrtc / libp2p (MIT) + cr-sqlite (MIT) | Gossip transport + CRDT store | Yes | High | Untrusted-peer model; merge poisoning | CRDT schema, causality (HLC exists in `src/federation/clock.ts`), signature-checked merges |
| Radicle | **B** | `rad` CLI (GPL-3.0) | CLI spawn | No | Med | External process; git-based | World/character ↔ repo mapping; merge-on-pull |
| Interop (many networks at once) | **B** | matterbridge (Apache-2.0) / mautrix (AGPL-3.0) | daemon REST API | No | Med | AGPL for mautrix; daemon ops | Bridge config; message normalization |
| Identity (OIDC/DIDComm/WebFinger) | **C** (+A for OIDC RP lib) | openid-client (MIT) if OIDC | OIDC RP, DIDComm, WebFinger | Yes (RP lib) | Med | Foreign auth never trusted (C5) | `federated_identities` store, shadow accounts, verified-ownership proof, WebFinger route |
| MCP bridge | **A** | @modelcontextprotocol/sdk (MIT) | MCP stdio/HTTP | Yes | Med | Tool surface exposure | Tool registry ↔ MCP tool mapping; registry verbs |

---

## 5. Blocker / risk register

| # | Risk | Families affected | Mitigation (seam) |
|---|---|---|---|
| R1 | **E2EE key custody** — host holds Megolm/Olm/OMEMO/PGP keys; compromise = plaintext history | Matrix, XMPP, Email | Keys encrypted at rest (`epic-crypto.md` standard); per-adapter credential envelope; key rotation; never log key material |
| R2 | **Moderation of inbound content** — foreign content must pass the existing NSFW/moderation gate before persistence or display (C6) | All inbound | Gate wired into the adapter inbound path before chat persistence; blocklist effect on already-delivered objects (`BUG-inbound-federation-content-not-moderated-before-display`) |
| R3 | **Spam/abuse (email)** — open relay behavior, backscatter, inbound spam | Email | IMAP fetch (not open MX) or webhook relay; SPF/DKIM/DMARC for outbound; rate-limit + spam score gate on inbound mail → chat |
| R4 | **ToS risk** — Discord/Telegram/WhatsApp prohibit user-account automation | Telegram, Discord, WhatsApp | Bot accounts only; WhatsApp experimental/deferred |
| R5 | **Server infra** — ActivityPub S2S needs public HTTPS origin + stable domain; XMPP MUC needs an external XMPP server; Matrix appservice needs an external homeserver | ActivityPub, XMPP, Matrix | Webhook relay instead of own MX for email; document reverse-proxy + public origin requirement; NodeInfo already implemented for discovery |
| R6 | **Secret storage** — adapter credentials (SMTP passwords, bot tokens, Matrix access tokens, XMPP creds) must be encrypted at rest, never logged | All adapters | Credential envelope in `src/crypto/`; config `sensitive` field marking (precedent: `federation.peers[].trust.ca` in `federation-trust-mechanism.md` §2) |
| R7 | **Egress control** — a compromised or buggy adapter must not exfiltrate | All adapters | Plugin-host scopes + egress allowlist (missing today — §2.4); per-adapter rate limits |
| R8 | **Identity spoofing** — foreign auth never trusted (C5); verified-ownership proof required | All federated | `federated_identities` + shadow accounts; signature verification on every inbound activity |
| R9 | **Delivery reliability** — duplicate Create/Announce, retries, dead-letter | ActivityPub, swarm | Idempotency keys + delivery queue (`BUG-federation-delivery-reliability-queue-retry-idempotency-unde`) |
| R10 | **Licensing contamination** — copyleft daemons (AGPL: slidge, mautrix; GPL: signald) are separate processes; linking them into the LGPL app would matter, process isolation keeps them clean | Signal, interop | Run copyleft components as external daemons only; never link |

---

## 6. Recommended sequencing

1. **Shared seams first** — `EncryptionProvider` / `MessageBridge` / `BridgeRegistry` (`TASK-integrations-shared-seams-encryptionprovider-messagebridge-b`) + integration config surface + adapter secret storage + health/rate-limit. Every adapter depends on these.
2. **Email** — lazy deps (`TASK-email-deps-as-opt-in-lazy-import-nodemailer-imapflow-openpgp`) + deliverability/spam gate. Unblocks auth F5 e-mail OTP (`epic-auth-channel-provisioning.md`).
3. **Matrix** — client SDK + E2EE + appservice registration. Highest leverage: one adapter plus appservice bridges reaches Discord/Slack/IRC.
4. **Chat-room protocols** — XMPP, IRC, Telegram, Discord native adapters (grammY, discord.js); Matterbridge as the fan-out alternative.
5. **ActivityPub via Fedify** — after blog threading (G15, now shipped) and identity mapping land; blog system is the federation primitive.
6. **Nostr** — lightweight add-on (NIP-28/29).
7. **Signal** — permanently deferred (C11) behind a feature flag.
8. **Swarm CRDT** — after Epic 26's leader-based path is stable (C1/C2/C3 open).
9. **Interop daemons** — matterbridge/mautrix adopted per-network as needed, not built.

---

## 7. Sources

- In-repo: `src/integrations/adapter.ts`, `src/federation/*.ts`, `src/transport/protocol.unified.ts`, `src/plugins/types.ts`, `src/plugins/loader.ts`, `src/plugins/event-bus.ts`, `src/routes/federation.ts`, `src/routes/v1/index.ts`, `src/config/sections/transport.ts`, `configs/config.example.toml`, `configs/env.example.yaml`, `schemas/config.transport.schema.json`, `docs/spec/plugin-system.md`, `docs/spec/federation-*.md`, `.plan/epics/epic-*.md`, `.plan/matrix-federation-decisions.md`, `.plan/matrix-protocol-chat-group-integration.md`, `.plan/tickets/*`.
- External (verified 2026-10-02): Fedify — https://fedify.dev/ · https://github.com/fedify-dev/fedify (MIT, Bun-compatible) · matrix-js-sdk — https://github.com/matrix-org/matrix-js-sdk (Apache-2.0) · @matrix-org/olm — https://github.com/matrix-org/olm (Apache-2.0) · imapflow — https://github.com/postalsys/imapflow (MIT) · nodemailer — https://nodemailer.com/license (MIT-0) · postal-mime — https://github.com/postalsys/postal-mime (MIT-0) · OpenPGP.js — https://github.com/openpgpjs/openpgpjs (LGPL-3.0) · @xmpp/client — https://github.com/xmppjs/xmpp.js (ISC) · grammY — https://github.com/grammyjs/grammY (MIT) · discord.js — https://github.com/discordjs/discord.js (Apache-2.0) · nostr-tools — https://github.com/nbd-wtf/nostr-tools (Unlicense) · libp2p — https://github.com/libp2p/js-libp2p (MIT/Apache-2.0) · matterbridge — https://github.com/42wim/matterbridge (Apache-2.0) · mautrix — https://github.com/mautrix/signal (AGPL-3.0) · slidge — https://codeberg.org/slidge/slidge (AGPL-3.0-or-later) · biboumi — https://biboumi.louiz.org/ (Zlib) · signald — https://gitlab.com/signald/signald (GPL-3.0) · Nostr NIP-28 — https://nips.nostr.com/28 · Signal-Server (AGPL-3.0, reference for signald's upstream) — https://github.com/signalapp/Signal-Server · matrix-bot-sdk — https://github.com/turt2live/matrix-bot-sdk (MIT) · matrix-appservice-irc/-discord/-slack — https://github.com/matrix-org/matrix-appservice-irc (Apache-2.0) · irc-framework — https://github.com/kiwiirc/irc-framework (MIT) · whatsapp-web.js — https://github.com/pedroslopez/whatsapp-web.js (Apache-2.0) · Hollo — https://github.com/fedify-dev/hollo (AGPL-3.0) · cr-sqlite — https://github.com/vlcn-io/cr-sqlite (MIT) · radicle-cli — https://github.com/radicle-dev/radicle-cli (GPL-3.0) · ssb-db — https://github.com/ssbc/ssb-db (MIT) · Veilid — https://gitlab.com/veilid/veilid (MPL-2.0) · openid-client — https://github.com/panva/openid-client (MIT) · @modelcontextprotocol/sdk — https://github.com/modelcontextprotocol/typescript-sdk (MIT) · libsignal-protocol-javascript — https://github.com/WhisperSystems/libsignal-protocol-javascript (GPL-3.0) · SimpleX Chat bot API — https://github.com/simplex-chat/simplex-chat/tree/stable/bots · Nostr NIP-44 — https://nips.nostr.com/44.
- All third-party claims in this report verified against primary sources 2026-10-02 (repo LICENSE files, npm registry metadata, upstream docs); no deferred claims.
