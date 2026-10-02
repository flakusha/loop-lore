<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# SPEC: Integrations Architecture

**Status:** design spec (planning-only seams marked)
**Companion:** [`docs/research/federation-messenger-email-integration-research.md`](../research/federation-messenger-email-integration-research.md) · [`docs/spec/federation-email-channel.md`](federation-email-channel.md) · [`docs/spec/federation-messenger-channels.md`](federation-messenger-channels.md)

---

## 1. Purpose

Defines the interface provision for loop-lore's external connectivity: the seams every protocol integration implements, the inbound HTTP surface loop-lore exposes to be federative/consumable, outbound routing from chats to adapters, identity mapping, moderation gating, the E2EE boundary, the config surface, and the plugin-host contract for third-party integration plugins.

Layering (fixed by `TASK-consolidate-chat-im-adapter-abstraction-above-protocolhandle`):

```
chat / group-chat / blog  (loop-lore primitives)
        │
MessageBridge  ── routes AdapterMessages to/from adapters
        │
ProtocolAdapter  (src/integrations/adapter.ts — THE message-level seam)
        │
ProtocolHandler  (src/transport/protocol.unified.ts — byte/connection layer)
```

Transport-level fetch (federation gossip `PeerFetch`, swarm sync) is NOT an adapter — it stays on `ProtocolHandler`.

---

## 2. The three seams — implemented vs planned

### 2.1 `ProtocolAdapter` — IMPLEMENTED

`src/integrations/adapter.ts`. The single message-level contract. Capability-gated optional surface (`ChannelCapable`, `PresenceCapable`, `ReactionCapable`, `MessageEditCapable`) advertised via `capabilities()` against the `ADAPTER_CAPABILITIES` registry (`channels`, `presence`, `reactions`, `message-edit`, `auth-challenge`, `auth-approval`). `AdapterMessage` is the minimal envelope: `{ id, author, target, body, timestamp }` — all protocol-side ids opaque to the core. Full contract: `src/integrations/adapter.ts` (authoritative).

### 2.2 `MessageBridge` — PLANNED

`src/integrations/bridge.ts` (tracked by `TASK-integrations-shared-seams-encryptionprovider-messagebridge-b`). Contract:

```ts
export interface MessageBridge {
  /** Route an outbound loop-lore message to the adapter owning `target`. */
  send(target: string, message: AdapterMessage): Promise<void>;
  /** Register the inbound handler; adapter messages land here. */
  onMessage(handler: (message: AdapterMessage) => void): void;
}
```

The bridge owns: chat ↔ adapter-target resolution, outbound moderation gate invocation, idempotency/dedup, rate-limit enforcement, and retry/degradation (§4). It must NOT own protocol framing (adapter) or byte transport (handler).

### 2.3 `EncryptionProvider` — PLANNED

`src/integrations/encryption.ts` (same ticket). Contract per `epic-integrations-core.md`:

```ts
export interface EncryptionProvider {
  encrypt(message: AdapterMessage): Promise<EncryptedMessage>;
  decrypt(message: EncryptedMessage): Promise<AdapterMessage>;
  generateKeys(): Promise<KeyPair>;
}
```

Concrete providers live in their owning sub-epics: `MatrixEncryption` (Olm/Megolm), `OmemoEncryption` (XMPP), `PgpEncryption` (email). Key material comes from `epic-crypto.md`. Do NOT conflate with `MeshEncryptionProvider` in `src/federation/encryption.ts` (mesh-specific, separate).

### 2.4 `BridgeRegistry` — PLANNED

`src/integrations/` (same ticket + `FEAT-messaging-bridge-extensions`). Registers/unregisters `ProtocolAdapter` instances with declared capabilities; the bridge resolves targets through it. Capability negotiation: a send to a target whose owning adapter lacks `message-edit` degrades to delete+resend rather than failing.

---

## 3. Inbound surface loop-lore must EXPOSE

All new routes follow the existing mounting pattern: an Elysia sub-app factory in `src/routes/` returning `new Elysia()`, mounted via `.use()` from `src/routes/v1/index.ts` (versioned, prefix `/api/v1`) or `src/routes/federation.ts` (spec-fixed unversioned paths), composed into `src/elysia-app.ts` via `v1Routes({ database, config, asyncStore })`. Plugin-registered routes go through `registerPlugins(app, { database, config, asyncStore })` (`src/elysia-app.ts:208`).

| Surface | Route shape | Mount point | Tracked by |
|---|---|---|---|
| ActivityPub inbox | `POST /users/:actor/inbox` (HTTP-signature verified) | `src/routes/federation.ts` (unversioned, spec-fixed) | `FEAT-activitypub-federation` |
| ActivityPub actor | `GET /users/:actor` (ActivityPub negotiation) | same | same |
| ActivityPub outbox | `GET /users/:actor/outbox` (paginated `OrderedCollection`, newest-first, capped — C9) | same | same |
| WebFinger | `GET /.well-known/webfinger?resource=acct:user@host` | same (NodeInfo already lives here) | `FEAT-activitypub-federation` |
| NodeInfo | `GET /nodeinfo/2.1` + `/.well-known/nodeinfo` | `src/routes/federation.ts` — IMPLEMENTED | — |
| Matrix appservice registration | `PUT /_matrix/app/v1/transactions/:txnId` (inbound; caller = remote homeserver, authenticated via appservice `hs_token` in the Authorization header — default-deny, no token → 401) + client-side registration against the admin's homeserver | `src/routes/matrix.ts` (new) | `TASK-matrix-integration` |
| Webhook ingestion | `POST /api/v1/integrations/webhooks/:adapter` (HMAC-verified, per-adapter secret; missing/invalid signature → 401, payload never processed — default-deny) | `src/routes/v1/integrations-surface.ts` (new) | `TASK-inbound-webhook-ingestion-surface-hmac-verified-default-deny` |
| OpenAPI/REST for external tools | `/api/v1/*` + `/api/v1/openapi.json` | `src/routes/v1/` — IMPLEMENTED (`openapi.ts`) | — |
| MCP bridge | MCP stdio/HTTP server exposing the tool registry (stdio = local-user trust boundary, no network auth needed; HTTP variant is loopback-only or authenticated — never exposed unauthenticated) | `src/integrations/mcp/` (new) | `TASK-workspace-mcp-bridge-on-openclaw-serve-registry-pattern` |

Rule: unversioned spec-fixed paths (ActivityPub, WebFinger, NodeInfo) live in `src/routes/federation.ts` behind `config.federation.enabled`; versioned API paths live in the v1 surfaces; plugin-provided routes go through the plugin runtime.

Authorization rule (every inbound endpoint): authenticate the caller server-side and default-deny — unknown/absent/unauthenticated is rejected, never accepted. User-facing v1 routes compose the existing `authenticate()` middleware (`src/middleware/auth/authenticate.ts` — JWT verified against the session table, `required` flag, 401 on missing/invalid). Machine-facing endpoints use their protocol's native proof: HTTP signatures (ActivityPub inbox — the signature binds the request to the actor, which is the resource), per-adapter HMAC secrets (webhooks), appservice `hs_token` (Matrix transactions — explicit server-to-server trust boundary; the remote homeserver is the only legitimate caller). Resource-level: a webhook authenticates the adapter, not a user — adapter-scoped secrets must not be usable across adapters; an ActivityPub actor may post only to its own inbox.

---

## 4. Outbound: routing from loop-lore chats to adapters

### 4.1 Primitive mapping

Per `matrix-protocol-chat-group-integration.md` (verified):

| loop-lore primitive | External protocol shape | Used by |
|---|---|---|
| **chat** (1:1) | DM / PM / 1:1 | all messengers |
| **group-chat** (multi-participant) | room / channel / MUC / guild-channel | Matrix, IRC, XMPP, Discord, Telegram, Slack, … |
| **blog** (posts + threaded comments + follows) | Lemmy Post/Page, Mastodon Status, Reddit post | ActivityPub, Nostr (kind 1) |

`src/group-chat/turn-selector.ts` schedules AI participants; the mention-parser resolves @-mentions. Both are reused unchanged by adapters.

### 4.2 Thread identity

- Chat-room protocols: thread = protocol-side id (Matrix `event_id` root, IRC flat, XMPP MUC thread id, Telegram topic id). Map to loop-lore `parent_message_id` where the protocol supports it; flat protocols (IRC) degrade to sequential context.
- Blog/fediverse: thread = `inReplyTo` / `parent_comment_id` (blog comments now threaded — `src/db/migrations/001_init.ts` + `src/db/schema-blog.ts`).
- Cross-instance mentions: `IDEA-cross-instance-conversation-threading-mention-inreplyto`.

### 4.3 Idempotency / dedup

- Outbound: the bridge stamps each `AdapterMessage` with a loop-lore idempotency key (reuse `messages.idempotencyExpiryHours` semantics); adapters that support protocol-side dedup (Matrix `event_id`, ActivityPub `id`) echo it back.
- Inbound: dedup on `(adapter, protocol_message_id)` — a delivery retry must not create a second chat message. ActivityPub `Create`/`Announce` dedup is an explicit AC (`BUG-federation-delivery-reliability-queue-retry-idempotency-unde`).

### 4.4 Rate limits

Per-adapter, per-target token buckets enforced in the bridge (not the adapter): configurable per adapter instance (open question in `epic-integrations-core.md` — default per-protocol global with per-instance override). Bot-API protocols (Telegram/Discord) impose their own limits; the bridge must respect `Retry-After`.

### 4.5 Retry / degradation

- Transient failure (timeout, 429, 5xx): exponential backoff with jitter, bounded retries, then dead-letter with structured log.
- Protocol-breaking failure (schema change, auth expiry): mark adapter unhealthy, surface in the status dashboard, fall back to the next ladder rung where the consumer is an auth channel (`epic-auth-channel-provisioning.md` invariant 7).
- Edit unsupported: degrade delete+resend when the adapter lacks `message-edit`.

---

## 5. Identity

Per `matrix-federation-decisions.md` C5 and `BUG-federation-identity-mapping-to-local-users-undefined`:

- **Foreign auth is never trusted.** A verified-ownership proof issues a loop-lore session; the foreign assertion is only a factor rung (`epic-auth-channel-provisioning.md` invariant 6).
- **Shadow account by default.** A foreign actor (`@user@origin`, `@bot@telegram`, email address) resolves to a shadow local account; linking to an existing user happens once proof is presented.
- **Mapping store:** `federated_identities` (actor_uri ↔ local user_id, shadow-or-link) + `actor_mappings` (remote actor ↔ local graph-node for chats/group-chat/RPG invites) — `TASK-instance-switching-backend-instances-handles-actor-map`.
- **Handle syntax:** `@user@instance` parsed/resolved via the origin server; bare handles resolve locally (`src/federation/handles.ts`).
- **OIDC:** RP-only; assertion → verified binding → `federated-oidc` factor rung. Never an IdP for others.

---

## 6. Moderation / NSFW gate

- **Outbound:** every federated send routes through the existing NSFW + moderation gate before leaving the instance (`epic-federation-swarm-sync.md` cross-cutting; `BUG-character-federation-lacks-owner-consent-or-nsfw-gate` for the character-actor consent flag).
- **Inbound:** foreign content passes the existing moderation service before persistence or display (C6, `BUG-inbound-federation-content-not-moderated-before-display`). Blocklist effect on already-delivered objects is defined in `docs/spec/federation-defederation-admin.md`.
- **Defederation/blocklist hooks:** `docs/spec/federation-defederation-admin.md` — `defederation_blocks` (noop/silence/suspend + reject_media/reject_reports/obfuscate), `user_instance_blocks` (per-user opt-out), Mastodon-format CSV import/export, admin audit log. The bridge consults the defederation service before every send and after every inbound receive.

---

## 7. E2EE boundary

| Protocol | Host reads plaintext? | Key custody | What loop-lore stores |
|---|---|---|---|
| Matrix (Olm/Megolm) | Yes — host holds Megolm room keys + Olm device keys | Server-managed; cross-signing + key backup | Encrypted Megolm sessions; device keys encrypted at rest |
| XMPP (OMEMO) | Only if the host holds the device key (it does for its own MUC/1:1 participation) | Device keys, TOFU trust | Device list, encrypted payloads |
| Email (PGP) | Only with the user's private key (opportunistic) | User-managed keyring | Public keys; private keys only if the user opts in |
| Telegram/Discord/Slack | Yes — bot APIs are server-side plaintext | Bot tokens | Message plaintext in loop-lore chats |
| Signal | No — Signal Protocol E2EE; host is a daemon client | signald holds keys | Nothing (deferred) |
| ActivityPub | No — no E2EE in ActivityPub | Actor signing keys (HTTP signatures only) | All plaintext |
| Nostr | No for public chat (NIP-28); NIP-44 DMs are E2EE | User keypair | Public events; private key only if user opts in |

Rules:
- Private key material is encrypted at rest per the `epic-crypto.md` key-at-rest standard; actor-key rotation per C8 (`BUG-activitypub-actor-signing-keys-and-rotation-undefined-no-cry`).
- `isEncrypted()` on `ProtocolAdapter` reports transport E2EE truthfully; the bridge uses it to decide whether plaintext persistence is acceptable.
- Secret hygiene: challenge nonces and factor secrets hashed/encrypted at rest; codes never logged (`epic-auth-channel-provisioning.md` invariant 8).

---

## 8. Config surface + opt-in lazy loading

### 8.1 Pattern

Each integration registers a config section triple (`src/config/sections/<ns>.ts` schema + defaults + meta, mirrored in `schemas/config.<ns>.schema.json`) following `src/config/sections/transport.ts` + `schemas/config.transport.schema.json` precedent. Env overrides flatten to UPPER_SNAKE (`configs/env.example.yaml` + `src/config/schema-class/env-map.ts`).

### 8.2 Keys to add

```toml
# configs/config.example.toml
[integrations]
enabled = false                       # master switch; default off

[integrations.email]
enabled = false
imapHost = ""                        # empty = unconfigured
imapPort = 993
imapUser = ""
imapPass = ""                        # ⚠ SECRET
smtpHost = ""
smtpPort = 587
smtpUser = ""
smtpPass = ""                        # ⚠ SECRET
pgpEnabled = false

[integrations.matrix]
enabled = false
homeserver = ""
accessToken = ""                     # ⚠ SECRET
appservice = false

[integrations.xmpp]
enabled = false
jid = ""
password = ""                       # ⚠ SECRET

[integrations.telegram]
enabled = false
botToken = ""                        # ⚠ SECRET

[integrations.discord]
enabled = false
botToken = ""                        # ⚠ SECRET

[integrations.irc]
enabled = false
server = ""
nick = ""
# password = ""                 # ⚠ SECRET — optional SASL password

[integrations.nostr]
enabled = false
relayUrls = []
```

Env equivalents: `INTEGRATIONS_ENABLED`, `EMAIL_IMAP_HOST`, `EMAIL_SMTP_PASS`, `MATRIX_ACCESS_TOKEN`, `XMPP_JID`, `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `IRC_SERVER`, `IRC_NICK`, `IRC_PASSWORD`, `NOSTR_RELAY_URLS` (full map in `env-map.ts`).

### 8.3 Lazy-loading rule

**Cold start with an integration unconfigured imports zero integration libraries.** Adapter modules (`src/integrations/<family>/`) are loaded via dynamic `import()` only when their config section is enabled; all third-party deps (imapflow, nodemailer, openpgp, matrix-js-sdk, @xmpp/client, grammY, discord.js, Fedify) are optional peer dependencies. `send()` with no config fails gracefully with a typed not-configured error. This is the pattern fixed by `TASK-email-deps-as-opt-in-lazy-import-nodemailer-imapflow-openpgp` (assert via module-load probe).

---

## 9. Plugin-host contract for third-party integration plugins

### 9.1 What the current runtime provides

Manifest (`PluginManifest`, `src/plugins/types.ts`): `name`, `version`, `description`, `author`, `homepage?`, `license?`, `onLoad?(ctx)`, `onUnload?()`, `tools?`, `agentRoles?`, `apiRoutes?`, `uiComponents?`, `eventHandlers?`, `migrations?`, `configSchema?`, `config?`, `characterRequirements?`. `PluginContext`: `db`, `config`, `logger`, `registerTool`, `registerAgentRole`, `registerApiRoute`, `registerUiComponent`, `registerEventHandler`. Lifecycle: `loadAllPlugins` → manifest → registry → `onLoad(ctx)` → persist `plugin_state`; reverse-order `onUnload()`. Event bus: `emitPluginEvent` wired to chat lifecycle (`chat.created/deleted/archived`, `message.variant.created`). Tool executor with timeout. Config merge. Mount-point lookup (`chat.header|sidebar|composer`, `admin.dashboard`). Admin API: `GET /api/plugins`, `POST /api/plugins/:name|disable`.

### 9.2 What integration plugins need (gaps → tickets)

| Need | Status | Gap |
|---|---|---|
| Declared capabilities beyond the 6 extension points (e.g. `adapter`, `webhook-receiver`) | **Missing** | `PluginCapability` enum has no integration values |
| Granted scopes (channels the adapter may read/write) | **Missing** | no scope field on manifest or context |
| Egress allowlist (hosts the adapter may call) | **Missing** | no network allowlist; sandboxing aspirational (`docs/spec/plugin-system.md`) |
| Secret-access tokens (per-plugin credential reference, resolved by the host) | **Missing** | no secret injection; plugins would need raw config access |
| Background timers / cron registration | **Missing** | no `registerTimer` on `PluginContext` |
| Webhook mounting | **Partial** | `apiRoutes` can receive webhooks, but no HMAC-verified webhook-receiver helper |
| UI component serving route | **Partial** | `getComponentsForMountPoint` lookup exists; no `GET /api/plugins/ui-components` route |
| Inbound event bus for adapter events | **Partial** | bus is chat-lifecycle-only; no `adapter.message.received` emission |

These gaps are tracked by `TASK-plugin-host-contract-for-third-party-integration-plugins`.

---

## 10. Failure modes

| Mode | Detection | Behavior |
|---|---|---|
| Unconfigured | config section disabled/empty | typed not-configured error; zero imports; route 404s |
| Unreachable | connect/send timeout | mark unhealthy; retry with backoff; dead-letter; dashboard surface |
 | Auth-expired | 401/403 from provider | mark unhealthy; structured log; admin re-auth prompt; never silent downgrade |
 | Rate-limited | 429 + `Retry-After` | honor header; per-adapter bucket; queue + retry |
| Protocol-breaking | schema/parse failure | mark unhealthy; dead-letter with payload ref; alert admin |
| Adapter crash | `onUnload` / process exit | registry removes adapter; bridge marks targets unreachable; health-aware fallback for auth channels |

---

## 11. Linked tickets

- `TASK-integrations-shared-seams-encryptionprovider-messagebridge-b` — the three planned seams
- `TASK-integration-config-surface-schemas-example-toml-env-map` — §8 config keys + schemas
- `TASK-adapter-secret-storage-encrypted-credential-envelope` — §7 credential envelope
- `TASK-adapter-health-monitoring-and-per-protocol-rate-limiting` — §4.4/§10
- `TASK-integrations-inbound-webhook-ingestion-endpoint` — §3 webhook surface
- `TASK-plugin-host-contract-for-third-party-integration-plugins` — §9.2
- `TASK-email-deliverability-spf-dkim-dmarc-and-inbound-spam-gate` — email channel spec
- `TASK-bridge-daemon-adoption-matterbridge-slidge-mautrix-biboumi-e` — interop daemon evaluation
