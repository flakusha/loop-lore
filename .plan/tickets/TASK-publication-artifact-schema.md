<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Publication Artifact Schema + Migration

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-book-outline-generation-workflow.md`, `TASK-comic-page-panel-layout-model.md`, `epic-assistant-creative-studio-workflows.md`, `epic-asset-platform-capabilities.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The persistence layer every other publication ticket builds on: a `publications`
table (the artifact), a `publication_units` table (ordered chapter or page), and
a `publication_panels` table (comic only — ordered panel with art asset,
caption, and optional bubble text). Owns ordering, ownership, soft delete, and
the Kysely type/manifest regeneration.

## Context

There is no artifact in `src/` today. `story_turns`
(`src/db/schema-story.ts:186`) is chat-scoped turn state owned by
`src/story/game-master/`; a publication has a lifetime independent of any chat
and must never be written into that table. Grep for `publications` across
`src/db/` returns nothing.

Migration conventions are fixed by `src/db/migrations/README.md`: append a new
top-level `NNN_*.ts` exporting `up(db)`/`down(db)` (HEAD is
`056_xp_ledger_dedupe_unique.ts`, so this lands as `057_*`), never renumber or
rewrite a shipped migration, and one `ADD COLUMN`/`DROP COLUMN` per `alterTable`
statement (SQLite limitation). After the migration, regenerate derived artifacts
with `bun run db:sync-types && bun run db:sync-manifest` then
`bun run schemas:check` — `src/db/schema.ts` and the `src/db/schema-*.ts` split
are generated artifacts and must not be hand-edited.

Art is referenced, never copied. Panels store an `art_asset_id` foreign key onto
`assets.id` (`src/db/schema-content.ts:37`) plus a polymorphic `asset_links` row
(`asset_links` at `src/db/schema-content.ts:17`; the entity vocabulary is
`AssetLinkEntity` in `src/db/enums-content.ts:73` — add the publication-panel
entity there and regenerate). Blob metadata, encryption tier, and content hash
stay in `assets`, where `createAsset`/`linkAsset` (`src/assets/service/create.ts`,
`src/assets/service/links.ts`) already maintain them.

Ordering is a dense integer `position` per publication for units and per unit
for panels, re-sequenced on insert and delete rather than left sparse — every
read path in this epic sorts by `(publication_id, position)` and a sparse index
makes that trivially wrong after the first delete. Soft delete is `deleted_at` on
the artifact row, matching the moderation tables' convention; every query
filters `deleted_at IS NULL`.

Shape (final DDL owned by this ticket):

```
publications
  id, owner_id, title, kind ("book" | "comic"),
  publication_status PublicationStatus DEFAULT 'draft', source_chat_id?,
  created_at, updated_at, deleted_at, data_version

publication_units            -- chapter (book) or page (comic)
  id, publication_id, position, title?, body?,
  publication_status PublicationStatus DEFAULT 'draft',
  pin PinnedState DEFAULT 'unpinned', created_at, updated_at

publication_panels           -- comic only
  id, publication_id, unit_id, position, art_asset_id?, caption?, bubble_text?,
  layout_json?, publication_status PublicationStatus DEFAULT 'draft',
  pin PinnedState DEFAULT 'unpinned', created_at, updated_at
```

**Do not invent a new status vocabulary.** `PublicationStatus`
(`src/db/enums-story/items.ts:45`) already exists with a guarded transition
table — `publicationStatusMachine` at `:68`, values `draft | review | published |
rejected | archived`, `archived` terminal, `rejected → draft` the only way back —
and it is already applied to `worlds` and `locations`
(`src/db/schema-story.ts:58,138`). `PinnedState` (`src/db/enums-core/flags.ts:8`)
covers `unpinned | pinned | archived`. Both are reused verbatim: the columns carry
the existing TypeScript types and the same SQL column defaults the repo already
applies to those columns — `notNull().defaultTo("draft")` for `publication_status`
and `notNull().defaultTo("unpinned")` for `pin`.

**On CHECK constraints: there is none on this column, so there is none to copy.** The
repo does use `addCheckConstraint` widely — `ck_users_role` (`src/db/migrations/001_init.ts:236`),
`ck_items_category` / `ck_items_rarity` (`:2365`, `:2369`), `ck_prompt_templates_modality` (`:3324`),
`ck_chats_type` (`:1791`) among them — but **no `publication_status` column carries one**.
Both existing columns are plain
`addColumn("publication_status", "text", (col) => col.notNull().defaultTo("draft"))`:
`locations` at `:519` and `worlds` at `:659`. Enum validity on those columns is
enforced in application code (`publicationStatusMachine`), not by the schema.

So this ticket copies the column *shape* only. Adding a CHECK on `publication_status`
would be new behavior for this column rather than a copy of existing practice; it is
not required here, and `PublicationStatus` already carries its own guarded transition
table. A publications-specific `state` enum would fork a vocabulary three other tables
already use.

## Acceptance Criteria

- [ ] Columns reuse `PublicationStatus` and `PinnedState` verbatim; no
      publications-specific status enum or ad-hoc `state` column is added
- [ ] `publication_status` is `text NOT NULL DEFAULT 'draft'` and `pin` is `text NOT NULL DEFAULT 'unpinned'`, matching the shape already applied to `worlds.publication_status` (`src/db/migrations/001_init.ts:659`) and `locations.publication_status` (`:519`). No CHECK constraint is added on `publication_status` — neither existing column has one (unlike e.g. `ck_users_role` at `:236`), and enum validity is enforced through `publicationStatusMachine` in application code
- [ ] `src/db/migrations/057_publication_artifacts.ts` exists, exports `up(db)`
      and `down(db)`, and creates `publications`, `publication_units`, and
      `publication_panels` with the columns above
- [ ] `down(db)` drops the three tables in reverse dependency order and leaves no
      orphan rows; `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts`
      passes
- [ ] Indexes cover the two hot reads: `(publication_id, position)` on
      `publication_units`, `(unit_id, position)` on `publication_panels`, and
      `owner_id` on `publications`
- [ ] `owner_id` is a foreign key onto the owning user/actor row and every read
      path filters it — a publication is readable only by its owner
- [ ] `deleted_at` is NULL-by-default on `publications`; setting it hides the
      artifact from every list/get query, and hiding does not hard-delete asset
      rows referenced by panels
- [ ] `AssetLinkEntity` in `src/db/enums-content.ts` gains the publication-panel
      entity, and `bun run db:sync-types && bun run db:sync-manifest` has been run
      so `src/db/schema.ts` and `src/db/schema-manifest.ts` reflect all three tables
- [ ] `bun run schemas:check` passes
- [ ] A repository layer under `src/publications/service/` exposes create/get/list
      of ordered units and ordered panels, re-sequencing `position` on insert and
      delete, with unit tests covering reorder-after-delete and owner isolation
- [ ] No column duplicates blob metadata (`size_bytes`, `mime_type`,
      `storage_path`, `content_hash`) — panels reference `assets.id` only