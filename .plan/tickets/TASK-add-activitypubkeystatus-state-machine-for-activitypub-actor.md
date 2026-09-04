<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add ActivitypubKeyStatus state machine for activitypub_actor_keys.status

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-federation-swarm-sync

## Summary

Replace string-typed status in activitypub_actor_keys with ActivitypubKeyStatus (active→rotated→revoked→expired). Must create src/db/enums-core/activitypub-key-status.ts with StateDef + createMachine, export from index, and add a `ActivitypubActorKeys.status` COLUMN_TYPE_OVERRIDES mapping (then `bun run db:sync-types`). No migration.

## Analysis (2026-09-04)

App-layer change only — **no migration needed**. `activitypub_actor_keys.status` confirmed in fresh migration-run DDL as `TEXT DEFAULT 'active'`. Path: (1) `src/db/enums-core/activitypub-key-status.ts` (StateDef + createMachine); (2) export from `enums-core` index; (3) `"ActivitypubActorKeys": { "status": "ActivitypubKeyStatus" }` in `COLUMN_TYPE_OVERRIDES` + `bun run db:sync-types`. No `src/db/migrations/*` change.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
