<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: DB guard triggers bypassed on UPDATE (003, 005)

**Status:** Not Started
**Priority:** high
**Effort:** Small (twin triggers + abort tests)
**Summary:** `BEFORE INSERT`-only guard triggers in `003_memory_audit_log_action_check` and `005_world_lore_lifecycle` are bypassed by `UPDATE` statements. Add a migration with `BEFORE UPDATE` twins of both triggers + abort tests.
**Context:** DB schema-gate audit (2026-09-25, db-migration-fixes session). Guards that only fire on INSERT let UPDATE writes violate the same invariants silently. Numbering: the audit's '017' is taken (`017_asset_links_archived_at`) — use the next free migration number at implementation time.

**Acceptance Criteria:**
- [ ] New forward migration adds `BEFORE UPDATE` twins for both guard triggers.
- [ ] Abort tests: an UPDATE that would violate each guard is rejected.
- [ ] Migration roundtrip (`migration-roundtrip.test.ts`) stays green.
- [ ] `bun run check` green.

**Tags:** db, triggers, migrations, guards
**Related:** src/db/migrations/003_memory_audit_log_action_check, src/db/migrations/005_world_lore_lifecycle, 017_asset_links_archived_at


git issue: f4e295c
