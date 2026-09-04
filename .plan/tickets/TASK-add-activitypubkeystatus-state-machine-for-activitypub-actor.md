<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add ActivitypubKeyStatus state machine for activitypub_actor_keys.status

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-federation-swarm-sync

## Summary

Replace string-typed status in activitypub_actor_keys with ActivitypubKeyStatus (active→rotated→revoked→expired). The 069_activitypub_actor_keys_and_federation_consent.ts migration defaults to 'active'. Must create src/db/enums-core/activitypub-key-status.ts with StateDef + createMachine, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
