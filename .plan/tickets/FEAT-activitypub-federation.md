# FEAT-activitypub-federation: ActivityPub / Lemmy / threadiverse federation

## What

Federate loop-lore **Worlds, Channels, and Characters** as fediverse actors so they can be followed and interacted with across instances and with the wider fediverse (Lemmy communities, Mastodon feeds). Implement an `ActivityPubAdapter` on the existing `ProtocolAdapter` seam.

## Why

The current plan only covers Matrix as a fediverse-style transport (`epic-communications-integrations.md` Phase 1). ActivityPub is the open standard behind Lemmy, Mastodon, Pixelfed, and PeerTube; federating worlds/channels unlocks cross-instance discovery and community participation that Matrix alone does not provide. No plan or ticket currently covers this.

## Current State

- `epic-communications-integrations.md` defines `ProtocolAdapter` / `MessageBridge` / `EncryptionProvider` seams but only names Matrix, XMPP, IM, and Email.
- No ActivityPub code, schema, or ticket exists.
- Research: **Fedify** is a maintained TypeScript ActivityPub framework that runs on Bun/Node/Deno and ships threadiverse (Lemmy/Mastodon-compatible) and content-sharing tutorials; used in production by Ghost and Hollo.

## Acceptance Criteria

- A World or Channel can be published as a fediverse `Group` actor with a resolvable WebFinger (`@world@host`).
- Inbound `Follow`/`Accept` and `Create`/`Announce` (`Note`/`Article`) are handled and verified via HTTP signatures + authorized fetch.
- Outbound world events/messages are delivered to followers as signed activities.
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
