<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: multi-user-collaboration-pijul-experimental

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-remote-harness-federation.md
**Tags:** harness, federation, pijul
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Multi-user collaboration over pijul, experimental. Patch-based collaboration with identity attached to patches and permission checks on push plus apply. Single backend on purpose: pijul patch semantics fit collaboration; git and jj collab are out of scope.

Explicitly NOT building:

- Git-based or jj-based collaboration.
- Real-time co-editing or CRDT sync (see epic-federation-swarm-sync.md, a distinct axis).
- Moderation or governance UI in v1.
- Promoting pijul collab out of experimental status.

**Context:**

The only multi-user path in the remote/federation epic; everything else here is single-user. Builds on the isolated pijul backend work, adds identity plus per-patch permission checks. Related: epic-harness-integration.md, epic-federation-swarm-sync.md.

**Acceptance Criteria:**

- [ ] Two users can collaborate on one project via pijul patches.
- [ ] Patches carry identity and apply only passes permission checks.
- [ ] Experimental labelling present on every collab surface.
- [ ] Tests passing, documentation updated.
