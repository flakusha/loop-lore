<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: DB guard triggers bypassed on UPDATE (003, 005)

**Status:** Done
**Priority:** high
**Effort:** Small (twin triggers + abort tests)
**Summary:** `BEFORE INSERT`-only guard triggers in `003_memory_audit_log_action_check` and `005_world_lore_lifecycle` are bypassed by `UPDATE` statements. Add a migration with `BEFORE UPDATE` twins of both triggers + abort tests.
**Context:** DB schema-gate audit (2026-09-25, db-migration-fixes session). Guards that only fire on INSERT let UPDATE writes violate the same invariants silently. Numbering: the audit's '017' is taken (`017_asset_links_archived_at`) — use the next free migration number at implementation time.

**Acceptance Criteria:**
- [x] New forward migration adds `BEFORE UPDATE` twins for both guard triggers.
- [x] Abort tests: an UPDATE that would violate each guard is rejected.
- [x] Migration roundtrip (`migration-roundtrip.test.ts`) stays green.
- [x] `bun run check` green.

## Verification 2026-09-29 — closed

The three `BEFORE UPDATE` twins exist in
`src/db/migrations/018_guard_triggers_update_twins.ts`:

- `:33` `memory_audit_log_action_check_update` — `BEFORE UPDATE OF action ON memory_audit_log`
- `:43` `world_lore_entries_confidence_check_update` — `BEFORE UPDATE OF confidence`,
  `WHEN NEW.confidence < 0 OR NEW.confidence > 100`
- `:53` `world_lore_entries_distortion_check_update` — `BEFORE UPDATE OF distortion_level`

The migration header at `:7-14` names this ticket as its reason, and the migration
is purely additive (no column changes, no rewrite of a shipped migration), so the
append-only policy holds. Note the audit said to use `017`, but that number is
taken by `017_asset_links_archived_at`; the twins shipped as `018`.

`bun test src/db/guard-triggers-update-twins.test.ts` = **4 pass / 0 fail**,
confirming the triggers actually abort rather than merely existing in DDL.

**Tags:** db, triggers, migrations, guards
**Related:** src/db/migrations/003_memory_audit_log_action_check, src/db/migrations/005_world_lore_lifecycle, 017_asset_links_archived_at


git issue: f4e295c
