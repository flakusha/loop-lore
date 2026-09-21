<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Migration tooling for legacy-to-rich character data

**Summary:** Existing V1 character cards in the DB use the legacy shape (InventoryItem with type:string, CharacterRelationship with target_character_id only). The canonical shape is unified (legacy fields coexist with rich fields), but no tooling backfills rich defaults (e.g. derive target_type from target_character_id presence, infer rarity from InventoryItem.type).
**Context:** Schema promotion to richer character fields landed; legacy cards become more useful with explicit, opt-in migration of safe defaults. Migration must be idempotent (no fabrication of fields when source data is absent) and must not require schema changes (bun:sqlite, production DB).
**Acceptance Criteria:** bun-runnable migration script src/scripts/migrate-character-legacy.ts registered in package.json scripts as 'migrate:character:legacy' that iterates characters, leaves inventory items missing rarity/weight/value undefined, defaults relationship target_type to 'character' when target_character_id present, logs per-character shape match / fields added / skipped report, is idempotent. Unit test src/scripts/migrate-character-legacy.test.ts covers a V1 character with 3 inventory items + 2 relationships. Run-record lands in .tmp/ for traceability.

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

**Why**: Existing character cards in the DB use the legacy V1 shape (InventoryItem with type:string, CharacterRelationship with target_character_id only). The canonical shape is now unified — legacy fields coexist with rich fields — but no tooling exists to backfill rich defaults (e.g. derive target_type from target_character_id presence, infer rarity from InventoryItem.type) so legacy cards become more useful without manual editing.

**Scope**: Build a bun-runnable migration script (src/scripts/migrate-character-legacy.ts, registered in package.json scripts as 'migrate:character:legacy') that:
1. Iterates all characters in the DB.
2. For each inventory item missing rarity/weight/value: leaves them undefined (no fabrication; explicit migration is opt-in).
3. For each relationship missing target_type: defaults to 'character' when target_character_id is present.
4. Logs a per-character report: shape match / fields added / skipped.
5. Idempotent (re-running adds no fields a second time).

**Acceptance**:
- Script runs against a fixture DB and reports the expected counts.
- Unit test: src/scripts/migrate-character-legacy.test.ts (or equivalent) covers a V1 character with 3 inventory items + 2 relationships.
- A run-record lands in .tmp/ for traceability.
- Reads from bun:sqlite (production DB), no schema changes required.

**References**:
- Spec: src/characters/spec/character.ts (Richer Optional Fields block)
- DB: src/db/schema-character.ts (characters table)
- Epic: .plan/epics/epic-character-core-system.md (FEAT-009)

**Branch**: open on dev.

**Out of scope**: LLM-driven enrichment (separate epic), per-bundle migration, frontend surface for migration status.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
