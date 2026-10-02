<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# SPEC: Federation Messenger Channels

**Status:** design spec
**Companion:** [`docs/spec/integrations-architecture.md`](integrations-architecture.md) · [`docs/spec/federation-email-channel.md`](federation-email-channel.md)

One section per messenger family. All adapters implement `ProtocolAdapter` (`src/integrations/adapter.ts`); all inbound passes the moderation gate before persistence (`integrations-architecture.md` §6); all outbound passes the NSFW gate; all credentials live in the adapter credential envelope (`TASK-adapter-secret-storage-encrypted-credential-envelope`); all deps are optional peer dependencies lazy-loaded only when the family's config section is enabled.

---

## 1. Matrix

**Adopt:** [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk) (Apache-2.0) + [@matrix-org/olm](https://github.com/matrix-org/olm) (Apache-2.0, WASM — no native addon). **Interface:** Client-Server API; `MatrixAdapter` (`src/integrations/matrix/adapter.ts` — planned: `TASK-matrix-integration`), `MatrixEncryption` (Olm/Megolm).

**Auth/secrets:** `integrations.matrix.homeserver` + `accessToken` (⚠ SECRET, encrypted at rest). Appservice mode: registration against the admin's external homeserver (`src/routes/matrix.ts`).

**Mapping:**

| Matrix | `AdapterMessage` | Notes |
|---|---|---|
| `event_id` | `id` | |
| `sender` MXID | `author` | shadow identity |
| room id / DM partner | `target` | room ↔ group-chat, DM ↔ chat |
| `content.body` | `body` | |
| `origin_server_ts` | `timestamp` | |
| `m.relates_to` (reply) | thread | → `parent_message_id` |

**Moderation:** inbound gate before display; outbound NSFW gate; room-level blocklist via defederation service.

**Rate limits:** per-homeserver buckets; honor `Retry-After` (429).

**E2EE:** Olm/Megolm — host holds Megolm room keys + Olm device keys (can read plaintext of its own rooms). Cross-signing + key backup is ground-up glue. `isEncrypted()` true for E2EE rooms.

**Test:** in-process fixture homeserver (mock Client-Server API); E2EE round-trip with Olm WASM in-process; appservice transaction fixtures.

---

## 2. XMPP

**Adopt:** [@xmpp/client](https://github.com/xmppjs/xmpp.js) (ISC) + OMEMO (XEP-0384, pure-JS). **Interface:** XMPP stream; `XmppAdapter` (`src/integrations/xmpp/adapter.ts` — planned: `TASK-xmpp-integration`), `OmemoEncryption`.

**Auth/secrets:** `integrations.xmpp.jid` + `password` (⚠ SECRET). MUC/federation requires an external XMPP server (Prosody/ejabberd) — loop-lore is a client.

**Mapping:**

| XMPP | `AdapterMessage` | Notes |
|---|---|---|
| stanza `id` | `id` | |
| `from` JID | `author` | shadow identity |
| MUC room / bare JID | `target` | MUC ↔ group-chat, 1:1 ↔ chat |
| `<body>` | `body` | |
| stanza timestamp | `timestamp` | |
| MUC thread / `in-reply-to` | thread | → `parent_message_id` |

**Moderation:** inbound gate; outbound NSFW gate; server-side moderation (MUC kicks/bans) is the external server's domain.

**Rate limits:** per-server buckets; stanza-level flow control.

**E2EE:** OMEMO — device keys, TOFU trust; host holds its own device key. `isEncrypted()` true for OMEMO sessions.

**Test:** in-process fixture XMPP server (local TCP fixture speaking the stream); OMEMO session fixtures; MUC join/message fixtures.

---

## 3. IRC

**Adopt:** minimal ground-up RFC 1459/2812 client (tiny) or `irc-framework` (MIT). **Interface:** line protocol over TCP/TLS; `IrcAdapter` (`src/integrations/irc/adapter.ts` — planned: `FEAT-messaging-bridge-extensions`).

**Auth/secrets:** `integrations.irc.server` + `nick` (+ optional SASL password ⚠ SECRET). No native auth model.

**Mapping:**

| IRC | `AdapterMessage` | Notes |
|---|---|---|
| `PREFIX` + command | `id` | synthesized (IRC has no message ids) |
| `nick!user@host` | `author` | shadow identity |
| `#channel` / nick | `target` | channel ↔ group-chat, PM ↔ chat |
| `PRIVMSG` text | `body` | |
| event time | `timestamp` | |
| — | thread | flat — degrade to sequential context |

**Moderation:** inbound gate; outbound NSFW gate; channel ops (kick/ban) via the adapter.

**Rate limits:** per-server flood control (message pacing).

**E2EE:** none. `isEncrypted()` false.

**Test:** in-process fixture IRC server (TCP fixture speaking RFC 1459); channel/PM fixtures; SASL fixtures.

---

## 4. Telegram

**Adopt:** [grammY](https://github.com/grammyjs/grammY) (MIT). **Interface:** Bot API (HTTPS); `TelegramAdapter` (`src/integrations/telegram/adapter.ts` — planned: `FEAT-messaging-bridge-extensions`).

**Auth/secrets:** `integrations.telegram.botToken` (⚠ SECRET). Bot accounts only (ToS).

**Mapping:**

| Telegram | `AdapterMessage` | Notes |
|---|---|---|
| `message_id` | `id` | |
| `from.id` / `from.username` | `author` | shadow identity |
| chat id | `target` | supergroup/channel ↔ group-chat, DM ↔ chat |
| `text` | `body` | |
| `date` | `timestamp` | |
| `reply_to_message_id` | thread | → `parent_message_id`; topics ↔ group-chat |

**Moderation:** inbound gate; outbound NSFW gate; bot privacy mode + chat admin rights.

**Rate limits:** Bot API global (~30 msg/s) + per-chat (1 msg/s) — enforced in the bridge; honor `Retry-After`.

**E2EE:** none for bot APIs (server-side plaintext). `isEncrypted()` false.

**Test:** mock Bot API server (local HTTPS fixture); long-poll + webhook fixtures; topic/thread fixtures.

---

## 5. Discord

**Adopt:** [discord.js](https://github.com/discordjs/discord.js) (Apache-2.0). **Interface:** Bot API (HTTPS/WSS gateway); `DiscordAdapter` (`src/integrations/discord/adapter.ts` — planned: `FEAT-messaging-bridge-extensions`).

**Auth/secrets:** `integrations.discord.botToken` (⚠ SECRET). Bot accounts only (ToS).

**Mapping:**

| Discord | `AdapterMessage` | Notes |
|---|---|---|
| `id` (snowflake) | `id` | |
| `author.id` / username | `author` | shadow identity |
| channel id | `target` | guild/text channel ↔ group-chat, DM ↔ chat |
| `content` | `body` | |
| `timestamp` | `timestamp` | |
| `message_reference` | thread | → `parent_message_id`; threads ↔ group-chat |

**Moderation:** inbound gate; outbound NSFW gate; guild moderation roles are the external server's domain.

**Rate limits:** global + per-route buckets (Discord's strict 429s) — enforced in the bridge; honor `Retry-After`.

**E2EE:** none. `isEncrypted()` false.

**Test:** mock Discord API + gateway fixtures; guild/channel/DM fixtures; thread fixtures.

---

## 6. Signal

**Adopt (deferred):** [signald](https://gitlab.com/signald/signald) (GPL-3.0) — external daemon, RPC interface. No official SDK; no bot API. **Verdict:** permanent-defer per `matrix-federation-decisions.md` C11; keep behind a feature flag. `SignalAdapter` would wrap the daemon RPC; nothing is built until an activation criterion is set (`BUG-signal-bridge-activation-trigger-undefined`).

**E2EE:** Signal Protocol — the host (signald) holds keys; loop-lore stores nothing.

**Test:** when activated — signald fixture daemon + RPC contract tests.

---

## 7. Nostr

**Adopt:** [nostr-tools](https://github.com/nbd-wtf/nostr-tools) (Unlicense). **Interface:** relay WebSocket; `NostrAdapter` (`src/integrations/nostr/adapter.ts` — planned: `IDEA-consider-nostr-as-a-lightweight-fediverse-axis`). NIP-28 (public chat, kind 40/41/42) + NIP-29 (groups, recommended successor).

**Auth/secrets:** `integrations.nostr.relayUrls[]` + user keypair (private key ⚠ SECRET, encrypted at rest; only if the user opts in).

**Mapping:**

| Nostr | `AdapterMessage` | Notes |
|---|---|---|
| event `id` | `id` | |
| event `pubkey` | `author` | shadow identity |
| NIP-28 channel id / NIP-29 group id | `target` | ↔ group-chat; kind 1 note ↔ blog |
| event `content` | `body` | |
| `created_at` | `timestamp` | |
| NIP-28 reply tags / NIP-29 reply | thread | → `parent_message_id` |

**Moderation:** inbound gate; outbound NSFW gate; relay-level filtering is best-effort.

**Rate limits:** per-relay buckets; respect relay rate limits.

**E2EE:** none for public chat (NIP-28); NIP-44 DMs are E2EE. `isEncrypted()` false for public chat.

**Test:** in-process fixture relay (WebSocket fixture speaking NIP-01); NIP-28/29 fixtures; NIP-44 fixtures if pursued.

---

## 8. ActivityPub (fediverse)

**Adopt:** [Fedify](https://github.com/fedify-dev/fedify) (MIT, Bun-compatible). **Interface:** ActivityPub S2S; `ActivityPubAdapter` (`src/integrations/activitypub/adapter.ts` — planned: `FEAT-activitypub-federation`). Inbox/actor/outbox/WebFinger routes in `src/routes/federation.ts` (§3 of `integrations-architecture.md`).

**Auth/secrets:** actor signing keys (RSA), encrypted at rest, rotated per C8 (`BUG-activitypub-actor-signing-keys-and-rotation-undefined-no-cry`); HTTP-signature verification on every inbound activity.

**Mapping (blog primitive):**

| ActivityPub | `AdapterMessage` | Notes |
|---|---|---|
| `Note`/`Article` `id` | `id` | |
| `attributedTo` actor | `author` | shadow identity |
| `to`/`cc` collection | `target` | blog ↔ group-chat; DM ↔ chat |
| `content` | `body` | |
| `published` | `timestamp` | |
| `inReplyTo` | thread | → `parent_comment_id` (blog comments threaded) |

**Moderation:** inbound gate before persistence (C6); outbound NSFW gate; defederation/blocklist per `docs/spec/federation-defederation-admin.md`.

**Rate limits:** per-peer delivery buckets; respect `Retry-After`.

**E2EE:** none — ActivityPub has no E2EE; host reads all plaintext. `isEncrypted()` false.

**Test:** Fedify in-process test fixtures (C12) — inbox/outbox round-trips, signature rejection, forged-actor injection; optional external Mastodon/Lemmy integration suite.

---

## 9. Interop daemons (alternative to native adapters)

When one daemon should fan out to many networks instead of embedding each protocol:

| Daemon | License | Interface | Reaches |
|---|---|---|---|
| [matterbridge](https://github.com/42wim/matterbridge) | Apache-2.0 | REST API | 20+ protocols (Matrix, IRC, XMPP, Telegram, Discord, Slack, WhatsApp, …) |
| mautrix-* | AGPL-3.0 | Matrix appservice API | WhatsApp/Telegram/Signal/Discord/… via Matrix |
| [slidge](https://codeberg.org/slidge/slidge) | AGPL-3.0-or-later | XMPP puppeting | legacy networks via XMPP |
| [biboumi](https://biboumi.louiz.org/) | Zlib | IRC/XMPP gateway | IRC ↔ XMPP |

**Verdict:** external daemon + its API (B). loop-lore talks to the daemon over HTTP; the daemon is a separate process (AGPL components stay process-isolated — R10). Adopted per-network as needed, not built. Tracked by `TASK-bridge-daemon-adoption-matterbridge-slidge-mautrix-biboumi-e`.
