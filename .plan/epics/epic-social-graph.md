<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Social Graph

**Overview:** (see sections below)


**Status:** 📝 Draft
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** social, friends, favorites, blocking, avoid, discovery, group-chat, blog

## Overview

User-facing social graph for loop-lore: friends, favorites (people and characters), discovery, chat entry points, and safety controls (block/ignore, avoid-characters). This is distinct from `epic-social-hub.md` (external platform adapters) — this epic owns the *internal* graph between loop-lore users and characters, and the rules by which the graph gates chats, RPG joins, and blog visibility.

## Scope

### Friends

- Bidirectional friend relationship (request → accept/decline), stored per user pair.
- Friend list powers: new-chat entry points, blog `friends` visibility tier, world-RPG invitations.

### Favorites

- Favorite users (one-way bookmark, no consent needed).
- Favorite characters — pinned in character selection UI; feeds "find favorites" discovery.
- Favoriting does not imply visibility changes; it is a sorting/pinning concern.

### Discovery & Entry Points

- Find friends or favorites by handle/search; from a found entity:
  - start a new direct chat, or
  - invite them into an existing world RPG — triggers the join mechanics below.
- Shared group chat / shared RPG space surfaces as a discovery source (people you play with are suggestible).

### RPG Join Invitations (direct & indirect)

- **Direct join** — invitee is added to the world RPG session as a player; reuses `src/group-chat/` member management + `turn-selector.ts` for AI turn arbitration with multiple humans.
- **Indirect join** — invitee enters as a character/NPC introduced in the roleplay first (in-place, contexted generation per `epic-npc-management-ui.md` / character-generation flows), with backfill of lore as owner; upgrade to full player later.
- Invitation lifecycle: invited → joined → left/kicked; owner consent required for direct join, invitee consent always required.

### Blog Visibility Levels

Extends the blog epic's tiered visibility (`public, followers, private` in `epic-blog-system.md`) to:

| Level | Meaning |
|---|---|
| `public` | anyone |
| `friends` | friend graph from this epic |
| `private (pre-shared)` | visible only to explicitly pre-shared users (per-post grant list), independent of friend status |

The blog epic keeps ownership of post storage/rendering; this epic supplies the visibility-resolution function (graph membership + per-post grants) it calls.

### Ignore / Block

- Blocked entity: cannot create new chats with the blocker, cannot send DMs; blog interactions gated.
- **RPG-safety rule:** a block cannot take effect while a shared RPG roleplay with the target is ongoing. The blocker must first leave the RPG, or kick the target player — this avoids yanking state out from under an active story. UI surfaces the options instead of silently failing.
- Blocks apply prospectively; existing message history is retained, not deleted.

### Avoid-Characters

- Per-user list of characters the user does not want to see.
- Effect: hidden from character selection and default listings; still selectable via direct search, and still visible inside a shared group chat / RPG space they are already part of.
- Softer than block: no message-level gating, presentation-level filtering only.

## Architecture Sketch

```
src/social-graph/
├── index.ts          # public API
├── friends.ts        # friend requests + graph queries
├── favorites.ts      # user/character favorites
├── blocks.ts         # block/ignore with RPG-safety checks
├── avoid.ts          # avoid-character list
├── visibility.ts     # blog tier resolution (public/friends/pre-shared)
└── invites.ts        # RPG join invitations (direct/indirect)
```

- Persistence via Kysely tables (friend_edges, favorites, blocks, avoid_characters, blog_post_grants, rpg_invites) — appended through the standard migration path.
- All gating (block/avoid) enforced server-side at route/middleware level, not just UI filtering.
- Federation: this graph is what `epic-federation-swarm-sync.md` and `epic-instance-federation.md` federate handles against; remote identities resolve to local graph nodes.

## Dependencies

- `epic-blog-system.md` — visibility tier consumption point.
- `epic-group-chat.md` / `src/group-chat/` — member management, turn selection for joined players.
- `epic-characters.md` / `src/characters/` — avoid-list subject; in-place NPC generation for indirect join.
- `epic-auth-access.md` — user identity that graph edges attach to.
- `epic-instance-federation.md` — remote handle → local node resolution for federated friends/blocks.

## Testing Strategy

- Friend request state machine (request/accept/decline/unfriend) unit tests.
- Block gating: new-chat creation rejected; RPG-safety rule — block rejected while shared RPG active, allowed after leave/kick.
- Avoid-character: filtered from listings, present via direct search and shared-group surfaces.
- Blog visibility: each tier resolves correctly for owner, friend, pre-shared user, stranger, blocked user.

## Related Epics

- `epic-social-hub.md` (external platform adapters — out of scope here)
- `epic-blog-system.md` (post storage; consumes visibility resolution)
- `epic-instance-federation.md` (federated identities in the graph)
- `epic-federation-swarm-sync.md` (federation transport these features ride on)
