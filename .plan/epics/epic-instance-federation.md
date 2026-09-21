<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Instance Federation — Identity, Switching & Cross-Sync

**Overview:** (see sections below)


**Status:** 📝 Draft
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** federation, instances, identity, handles, cross-sync, multi-instance

## Overview

User-to-instance federation: switch the active instance context (worlds, chats, characters) and join a remote instance as a first-class participant; Lemmy-style `@user@instance` handle extension carrying origin-server information; and future cross-sync of shared worlds and location state between multiple servers (also usable for business processing across branches in multiple countries).

This epic is user/instance-facing. Transport and protocol mechanics live in `epic-federation-swarm-sync.md` (ActivityPub, bridge registry, swarm CRDT) and leader-based reconciliation in `epic-multi-instance-reconciliation.md` (Epic 26); this epic consumes those seams without re-scoping them.

## Scope

### Instance Switching

- User can switch the active instance context: the visible worlds, chats, characters, and assets become those of the selected instance.
- Joining a remote instance registers the local user as a participant there ("join as a first") — a first-class account on the remote, not a guest shim.
- Switching preserves local session identity; per-instance session tokens are issued by the remote's existing auth (`epic-auth-access.md`).
- UI: instance picker (account switcher pattern); per-instance favorites/blocks from `epic-social-graph.md` resolve within the active instance, with remote handles still addressable.

### `@user@instance` Handle Extension

- Extend user identity with a federated handle (`user@example.instance`) à la Lemmy/Mastodon, plus the origin-server registration record (which server the account is native to, its endpoint, key material reference).
- Local users keep a bare handle; federated users always carry the origin suffix — resolution (WebFinger or equivalent) goes through the origin server.
- Handles are the join key for the social graph (`epic-social-graph.md`): friends, blocks, and invitations address remote users by handle.
- Mapping table: remote actor ↔ local user/character node, so chats, group-chat membership, and RPG invites work uniformly across local and federated identities.

### Cross-Sync — Shared Worlds & Location State (future)

- Multiple servers share world definitions and live location state (where players/NPCs are, scene state) — a peer topology, not single-writer.
- Business use case: one organization running branches in multiple countries syncs world/location state between their instances.
- Builds on the swarm CRDT reconciler from `FEAT-swarm-mode-reconciliation` (`epic-federation-swarm-sync.md`) — conflict-free merge of world/location documents; Epic 26's leader path remains the fallback topology.
- Explicitly gated as **future**: scope only after instance switching + handles land; no implementation before the federation blockers in `epic-federation-swarm-sync.md` (G15–G16) are resolved.

## Architecture Sketch

```
src/federation/
├── index.ts            # public API
├── instances.ts        # known instances, switching, per-instance sessions
├── handles.ts          # @user@instance parsing, resolution, origin registry
├── actor-map.ts        # remote actor ↔ local graph node mapping
└── cross-sync/         # future: shared world/location state sync
    └── (gated — see Scope)
```

- Persistence via the standard Kysely migration path (instances, federated_identities, actor_mappings tables).
- All remote identity trust boundaries follow `epic-federation-swarm-sync.md` security rules: signature verification, no foreign-auth trust, NSFW/moderation gate on inbound content.

## Dependencies

- `epic-federation-swarm-sync.md` — transport, ActivityPub adapter, swarm CRDT reconciler.
- `epic-multi-instance-reconciliation.md` (Epic 26) — leader-based reconciliation, store schema.
- `epic-auth-access.md` — per-instance sessions, key material storage.
- `epic-social-graph.md` — handle-keyed graph edges (friends, blocks, invites).
- `epic-anonymity-decentralization.md` — related decentralization surface; no overlap in scope.

## Testing Strategy

- Handle parsing/resolution: well-formed handles resolve via origin; malformed/local handles rejected; origin-server outage surfaces a typed error.
- Instance switching: context (worlds/chats/characters listings) reflects the active instance; local identity preserved across switches.
- Actor mapping: remote friend/block/invite address a remote handle uniformly with local users.
- Cross-sync (when unblocked): partition + heal convergence on shared world/location documents.

## Related Epics

- `epic-federation-swarm-sync.md` (protocols/transport — this epic is the user-facing layer above it)
- `epic-multi-instance-reconciliation.md` (Epic 26)
- `epic-social-graph.md` (graph edges keyed by federated handles)
- `epic-social-hub.md` (external messaging adapters — separate surface)
