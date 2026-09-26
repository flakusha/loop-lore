<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Database Schema

**Overview:** (see sections below)


**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** database, schema, tables, migrations, types

## Summary

Core relational tables for loop-lore. Designed to support multi-tenant chats, character cards (SillyTavern V1/V2), world definitions, asset linkage, and the conversation/message tree that all downstream subsystems depend on. Schema migrations are authored as additive, forward-only changes with explicit backfill scripts where shape changes are unavoidable.

**Context:** This epic is the data-model foundation for `epic-actors.md`, `epic-messages.md`, `epic-worlds-extension.md`, and the entire import/export surface (`docs/spec/import-export-io.md`). The 2026-07-30 audit in `epic-data-integrity-phase1.md` established the guardrail that **migrations must never drop columns or repurpose columns** — only additive changes + `format_version` per row. `epic-db-versioning.md` and `epic-migrations.md` operate downstream of this epic's tables.

## Scope

Core table families the schema must accommodate (full enumeration in `docs/spec/schema.md`):

- **Identity:** `users`, `sessions`, `api_keys`, `user_api_keys` (BYO provider keys)
- **Actors:** `actors` + child tables (`actor_memories`, `actor_notes`, `actor_lore_entries`, `actor_items`) — see `epic-actors.md`
- **Chats & messages:** `chats`, `chat_participants` (with `actor_id`), `messages` (with `parent_id` for branching), `message_reactions`
- **Worlds:** `worlds`, `locations`, `npcs`, `factions`, `quests` — see `epic-worlds-extension.md`, `epic-world-locations.md`
- **Assets:** `assets`, `asset_links` (polymorphic to actor/world/chat), `asset_versions` — see `epic-frontend-gallery.md`
- **Crypto & sessions:** `encryption_keys`, `user_secrets`, `factor_enrollments` (MFA, see `epic-two-factor-auth.md`)
- **Federation:** `peers`, `peer_keys`, `content_clearance` — see `epic-federation-swarm-sync.md`
- **Audit:** `audit_events` (immutable append-only), `telemetry_summaries`

### Design constraints

- **Additive migrations only** — never `DROP COLUMN`; never repurpose a column. Schema changes write through `format_version` per row.
- **Polymorphic joins** via `asset_links` / `chat_links` rather than ad-hoc foreign keys per feature.
- **Timestamps everywhere**: `created_at`, `updated_at`; soft-delete via `deleted_at` for user-visible entities.
- **Encryption hooks** on every column containing user content (see `epic-crypto.md`, `epic-shared-schemas.md`).
- **Per-row ownership** enforced via composite indexes on `(owner_id, scope)` for tenant isolation.

### Out of scope

- Stored procedures / triggers (Postgres-specific) — application-layer logic preferred for portability.
- OLAP rollup tables — handled by `epic-performance-dashboard-slo.md` if added.
- Vector / embedding tables — handled by `epic-rag-vector-store.md`.

## Acceptance Criteria

- [ ] All table families above present in `src/db/schema-*.ts` with explicit TypeScript interfaces (no `any`).
- [ ] Migration files numbered monotonically under `src/db/migrations/`, each idempotent + reversible.
- [ ] Forward-only constraint enforced: `scripts/check-migrations.mjs` rejects `DROP COLUMN` / column-type changes.
- [ ] Composite indexes for tenant isolation present on every owner-scoped table.
- [ ] `bun run check` + `bun run test` green; schema roundtrip test in `src/db/__tests__/schema-roundtrip.test.ts`.

## Related Epics

- `docs/spec/schema.md` (authoritative schema catalogue)
- `epic-actors.md` — consumes `actors` + child tables
- `epic-data-integrity-phase1.md` — guardrails this epic must obey
- `epic-migrations.md` — migration tooling for schema evolution
- `epic-shared-schemas.md` — reputation / consent / NSFW rating types

## Tickets

