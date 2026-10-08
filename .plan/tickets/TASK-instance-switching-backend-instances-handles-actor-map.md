<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Instance switching backend: instances, handles, actor-map

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-instance-federation

**Summary:**

Backend for epic-instance-federation.md (complements existing frontend switcher TASK-federation-instance-switcher-in-frontend-travel-between-inst): src/federation/instances.ts (known instances, active-origin switching, per-instance sessions via epic-auth-access.md), src/federation/handles.ts (@user@instance parse/resolve via origin server, bare-handle local rule), src/federation/actor-map.ts (remote actor <-> local graph-node mapping for chats/group-chat/RPG invites), Kysely migrations for instances/federated_identities/actor_mappings. Trust boundary: signature verification, no foreign-auth trust, NSFW/moderation gate on inbound (per epic-federation-swarm-sync.md security rules). AC: malformed handles rejected; origin outage surfaces typed error; switching scopes worlds/chats/characters to active instance with local identity preserved; remote friend/block/invite works by handle. Epic: epic-instance-federation.md.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
