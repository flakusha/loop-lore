<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-activitypub-federation: ActivityPub / Lemmy / threadiverse federation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


## What

Federate loop-lore **Worlds, Channels, and Characters** as fediverse actors so they can be followed and interacted with across instances and with the wider fediverse (Lemmy communities, Mastodon feeds). Implement an `ActivityPubAdapter` on the existing `ProtocolAdapter` seam.

## Why

The current plan only covers Matrix as a fediverse-style transport (`epic-communications-integrations.md` Phase 1). ActivityPub is the open standard behind Lemmy, Mastodon, Pixelfed, and PeerTube; federating worlds/channels unlocks cross-instance discovery and community participation that Matrix alone does not provide. No plan or ticket currently covers this.

## Current State

- `epic-communications-integrations.md` defines `ProtocolAdapter` / `MessageBridge` / `EncryptionProvider` seams but only names Matrix, XMPP, IM, and Email.
- No ActivityPub code, schema, or ticket exists.
- Research: **Fedify** is a maintained TypeScript ActivityPub framework that runs on Bun/Node/Deno and ships threadiverse (Lemmy/Mastodon-compatible) and content-sharing tutorials; used in production by Ghost and Hollo.


## Naming Collision — `src/federation/` Is NOT ActivityPub

`src/federation/` exists and looks like the home for this ticket. **It is not.** It is a
server-to-server **mesh envelope** subsystem, and the shared directory name is the single
biggest trap for anyone scoping this work. Verify against these facts before assuming an
AP implementation is available to extend.

What `src/federation/` actually is:

- A sealed-blob envelope, not a JSON-LD activity object. `ContentEnvelope` is
  `{id, origin, clock, type, hash, size, ciphertext}` (`src/federation/envelope.ts:13`)
  with AES-GCM ciphertext and hash+size integrity verification
  (`src/federation/envelope.ts:71`). No `@context`, no AS2 type vocabulary, no activity
  JSON anywhere in the module.
- Two PSK-gated HTTP endpoints, not an inbox/outbox: `POST /api/mesh-reserve`
  (`src/routes/federation-mesh.ts:46`) and `POST /api/mesh-deliver`
  (`src/routes/federation-mesh.ts:121`).
- NodeInfo discovery (`src/routes/federation.ts:59`, `src/routes/federation.ts:80`,
  `src/routes/federation.ts:105`) — `/.well-known/nodeinfo`, `/nodeinfo/2.1`,
  `/api/instance-state`. NodeInfo is server-to-server reachability, not actor documents.
- Opt-in and off by default: `FEDERATION_DEFAULTS.enabled = false`
  (`src/config/schema-class/federation.ts:8`), and `federationRoutes` mounts nothing when
  disabled (`src/routes/federation.ts:51`).

What is genuinely absent (each is a prerequisite for this ticket, not a detail):

- **No AP library.** No Fedify (or equivalent) in `package.json`.
- **No HTTP-signature verification module.** `src/crypto/` has no signature/HTTP
  signing file; the only mention of HTTP Signatures in `src/` is a comment at
  `src/crypto/activitypub-keys.ts:13`. This ticket's AC requires it on every inbox POST.
- **No inbox/outbox.** No route, no `OrderedCollection` document, no pagination.
- **No WebFinger or actor-document resolution** for local or remote actors.
- **No remote-identity mapping.** No `federated_identities`, `ap_id`, or `actor_uri`
  table. `BUG-federation-identity-mapping-to-local-users-undefined` records this gap and
  states it blocks all federation.
- **No object persistence with ownership metadata.** The only AP-named artifact is key
  storage: `activitypub_actor_keys` (`src/db/schema-manifest.ts:968`, created at
  `src/db/migrations/001_init.ts:793`). That is a keypair table with no reader in any live
  code path — it is not the protocol.

## Threading Dependency Chain

Implement in this order; neither threading ticket may start before this FEAT.

1. `FEAT-activitypub-federation` (this ticket) — **Not Started**. Owns actors, inbox,
   signature verification, authorized fetch, and object persistence.
2. `BUG-federation-identity-mapping-to-local-users-undefined` — Not Started. Maps a
   remote actor URI to a local user/actor; without it no remote activity has a local
   identity to attach to and no ownership check can be made.
3. `IDEA-cross-instance-conversation-threading-mention-inreplyto` — `Mention` /
   `inReplyTo` resolution. **Postponed**: it extends an inbox and identity model that do
   not exist yet.
4. `BUG-activitypub-federation-does-not-leverage-the-blog-system-lem` and
   `FEAT-federate-blog-system-via-activitypub-lemmy-mastodon-reddit` — Not Started and
   explicitly blocked. `blog_comments.parent_comment_id` (`src/db/schema-blog.ts:17`) is
   the natural local thread tree for federated replies, which is why threading belongs
   after that FEAT rather than beside it.

Verified while investigating item 3: `src/federation/` contains no AP protocol
implementation, so items 3 and 4 have no host code to extend.

## Acceptance Criteria

- A World or Channel can be published as a fediverse `Group` actor with a resolvable WebFinger (`@world@host`).
- Inbound `Follow`/`Accept` and `Create`/`Announce` (`Note`/`Article`) are handled and verified via HTTP signatures + authorized fetch.
- Outbound world events/messages are delivered to followers as signed activities.
- New followers receive paginated outbox backfill (Mastodon/Lemmy-style `OrderedCollection` pages, newest-first) covering a recent history window, capped by count and age (decision C9).
- Outbound `Delete` activities propagate to followers/peers and inbound `Delete`s are honored; right-to-be-forgotten erases federated copies (BUG-federated-delete-and-gdpr-right-to-be-forgotten-unhandled).
- Federated objects are persisted in the existing Kysely store with ownership/signature metadata.
- All outbound federation routes through the existing NSFW + moderation gate; inbound supports blocklists/defederation.
- Actor-model mapping (World/Channel/Character → actor type) is documented.

## Implementation Notes

- Library: **Fedify** (Bun-compatible). Inbox/outbox endpoints under a new `/federation/*` route group; reuse Elysia `t` validation.
- Model: World/Channel → `Group`; Character → `Person` or `Service`; messages → `Note`; rich world posts → `Article`; communities → Lemmy-compatible `Collection`/`OrderedCollection`.
- Security: enforce HTTP-signature verification on every inbox POST; authorized-fetch for outbound; object ownership checks to block forged `Announce`.
- Moderation: gate outbound through existing NSFW/moderation service; persist defederation list.
- Do **not** build Matrix here — that is `TASK-matrix-integration.md`.

## Dependencies

- `epic-communications-integrations.md` (`ProtocolAdapter` seam)
- `epic-federation-swarm-sync.md` (this epic)
- NSFW / moderation service (existing)
- Kysely store schema (existing)
