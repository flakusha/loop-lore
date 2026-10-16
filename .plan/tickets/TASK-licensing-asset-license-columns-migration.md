<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Per-Asset License / Model / Attribution Columns + Migration

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `epic-licensing.md`
**Related:** `TASK-licensing-publish-enforcement-point.md`, `TASK-licensing-publish-authorization-predicate.md`, `src/routes/character-licensing.ts`, `src/db/enums-character/content.ts`, `src/assets/service/validate.ts`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Land the unchecked per-asset half of the licensing epic: `assets.license` +
`assets.license_url` columns (plus producing-model and attribution fields) via
an append-only migration, with the history trail and optimistic-concurrency
version column the epic's security section already calls for.

## Context

**Verified ground state:**

- `assets.license` / `assets.license_url` columns **do not exist** — no
  migration adds them. Unchecked AC at `epic-licensing.md:54`; the epic's
  per-asset attribution intent is at `:39`.
- Licenses today are **character-scoped**:
  - `LicenseType` — `cc0 | cc_by | cc_by_sa | cc_by_nc | cc_by_nc_sa |
    proprietary | custom` (`src/db/enums-character/content.ts:16-26`).
  - The actor-type gate at `src/routes/character-licensing.ts:122-136` rejects
    any non-character actor with 400 — the licenses-are-character-only
    invariant recorded in the BUG-character-licensing-upsert comment
    (`:122-124`), because licensing rows otherwise pollute reports that don't
    filter by actor type.
  - The audit trail is the append-only `character_license_history` table
    (`:86`).

**COPY:** the `LicenseType` enum as the vocabulary (no second license
spelling) and the `character_license_history` pattern as the re-licensing
trail shape. **DO NOT copy:** the actor-type gate — assets are not actors. That
gate exists to keep licensing character-only; the asset columns are a separate
surface on a separate entity and must not be routed through the characters
licensing routes.

**The documented race:** `epic-licensing.md:62-64` — re-licensing rewrites
`assets.license` while codecs and exports read it (read-modify-write), with
optimistic concurrency (version column) named as the mitigation. The column set
must carry the version bump from day one; retrofitting it later means a second
migration and a window where readers have no conflict detection.

**Also not here:** `src/assets/service/validate.ts` is only
`validateFileSize` + `validateMimeType` (audio allowed at `:19-26`) — input
validation. The "reject missing license on user uploads" behavior
(`epic-licensing.md:58`) belongs at the upload/service boundary, not bolted
onto `validateMimeType`.

**Migration policy:** append-only per `src/db/migrations/README.md` — never
delete/rename/renumber/rewrite a shipped migration. Migration HEAD is
`src/db/migrations/056_xp_ledger_dedupe_unique.ts`, so this lands as a new
top-level `src/db/migrations/NNN_*.ts` exporting `up(db)` / `down(db)`
(auto-discovered by `getMigrationFiles()` — no wiring step). Regenerate the
derived artifacts per the README: `bun run db:sync-types && bun run
db:sync-manifest` then `bun run schemas:check`.

## Acceptance Criteria

- [ ] `src/db/migrations/NNN_asset_license_columns.ts` (or similar) appends
      `license` + `license_url` + producing-model + attribution columns to
      `assets`, with `up`/`down`; auto-discovered, no wiring added
- [ ] `license` reuses the `LicenseType` vocabulary
      (`src/db/enums-character/content.ts:16-26`); `license_url` nullable;
      a missing license is representable (NULL) and rejected at the upload
      boundary per `epic-licensing.md:58`
- [ ] Optimistic-concurrency version column on `assets` is present from this
      migration (`epic-licensing.md:62-64`)
- [ ] Re-licensing writes an immutable history row following the
      `character_license_history` pattern (`src/routes/character-licensing.ts:86`)
- [ ] The characters licensing routes are untouched; the asset surface does
      not inherit the actor-type gate
- [ ] `bun run db:sync-types && bun run db:sync-manifest && bun run
      schemas:check` clean; `bun test src/db/migrations.test.ts
      src/db/migration-roundtrip.test.ts` green
