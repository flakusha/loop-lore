<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Character Migration Specification

Status: UNSCOPED — no owning epic; flagged "genuine never-scoped" (TASK-character-migration-route) in `.plan/epics/epic-docs-vs-plan-gap-audit-2026-09-19.md`. Design doc; only a readiness data-model field exists in code.

## Implemented

- `MigrationStatus` = `migration-ready | migration-partial | migration-blocked | migration-complete` in `src/characters/spec/enums.ts`, plus `migration_status`, `migration_from_version`, `migration_to_version` fields on the character record (`src/characters/spec/character.ts`) — a readiness classification, not the state machine below.
- Schema-level version migrations live in `src/db/migrations/` — see `docs/spec/schema.md` for DB migration conventions.

## Not implemented / aspirational (design content, compressed)

- Six-state machine: `current → pending_migration → migrating → migrated | migration_failed → rolled_back`, with guards (target version newer + compatible, single in-flight migration per character, validation pass).
- Migration types: additive (new columns with defaults), transformative (data rewrite; idempotent, requires `down()`), destructive (audit copy first, 30-day retention, explicit admin confirmation).
- Per-migration validation gates: schema / row-count / column parity, FK integrity, application compatibility, sample spot-checks — any failure rolls back.
- Batch rules: ≤ 1000 characters per batch, 1s pause between batches, health monitoring during run, auto-rollback at > 1% error rate.
- Admin API: `POST /api/admin/migrations/trigger`, `GET /api/admin/migrations/:id`, `.../retry`, `.../rollback`, `GET /api/admin/migrations/history` — none exist in `src/routes/`.
- Audit record shape: migration id, character id, from/to version, status, timestamps, error detail, performed_by, rollback reason.

## Epics

- None — this spec has never been scoped. The gap-audit link above is the tracking home; if scoped, coordinate with `docs/spec/character-spec.md` (character system) and `docs/spec/schema.md` (migration format).
