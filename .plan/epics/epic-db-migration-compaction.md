<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: DB Migration Compaction — 14-file S2 baseline

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** operator approved full S2 compaction 2026-11-23; implementation in lane `consolidation-implement`
**Priority:** Medium (maintainability; no runtime behavior change on a fresh DB)
**Effort:** High
**Type:** Refactor Epic
**Tags:** db, schema, migrations, squashing, kysely, technical-debt

## Summary

Replace the 122 legacy `NNN_*.ts` migrations with **14 final-form per-domain files** (`001_core.ts` … `014_support_singletons.ts`), each emitting its tables once at final shape. Local DBs are disposable under S2: export → `db:reinit` → import. No compatibility shim and no `parts/` tree.

## Why fold this way

- Generators (`scripts/generate-db-types.ts`, `scripts/generate-schema-manifest.ts`) parse migration **text** via `scripts/lib/migration-parser.ts`, not by execution. They capture literal `.createTable()/.addColumn()` chains inside `up()` up to the first `.execute()`; helpers, loops and imported fragments silently drop columns. Inline Kysely DSL is mandatory.
- Raw SQL carries indexes, triggers, FTS virtual tables and the retained DML carriers; the generators ignore it, so `consolidated-schema-equivalence.test.ts` compares a golden dump from the retired chain against a fresh 14-file DB.
- `generate-db-types.ts:64` emits tables in first-create order, so the 14 files must reproduce today's global first-create order for byte-stable artifacts.
- 252 final user tables, one owner each: 001 core/support, 002 worlds, 003 actors, 004 characters, 005 chat, 006 crafting/RPG, 007 generation/assets, 008 mesh federation, 009 IVSS, 010 agent, 011 locations/factions/NPC, 012 content/blog, 013 moderation/NSFW, 014 support singletons. 120/121/122 fold into 003/001/005; 091's conditional backfill is retained in 005; 117 stays in 001 and 111 in 014.

## Design Invariants

1. **Final schema identical.** Canonical `sqlite_master` dump plus per-table `table_info`/`foreign_key_list` match the retired chain; generated artifacts reproduce byte-for-byte on a second run.
2. **One create per table.** 252 inline creates, no duplicate or omitted table, both FTS virtual tables present; no `DROP TABLE`/`PRAGMA foreign_keys=OFF` in the baseline.
3. **FK-safe ordering.** Per-domain files create FK targets before dependents; prefixes stay gapless 001…014 (3 digits).
4. **Guard stays.** `assertMigrationsNotStale` retained; stale DB recovery is recreate, not restore retired files.
5. **No process globals in tests.** One `:memory:` DB per rewritten test, idempotent teardown.

## Required Code/Test Changes (cutover checklist)

1. Replace the 122 files with the 14 final-form files; keep `README.md` and the canonical golden fixture.
2. Regenerate artifacts (`db:sync-types` + `db:sync-manifest`); assert a second run is a no-op and `check-db-schemas.ts` passes.
3. Re-point migration-coupled tests at final-shape behavior; keep the 119/120/121/122 oracles and the FTS/counter assertions.
4. Update README, `docs/spec/migrations.md`, stale gate comments, changelog and `.plan` premises.
5. `bun run check` green (or baseline-only advisories identical to dev); `bun test -j 1 src/db/` and `bun test src/db/` green.

## Worktree & SCM Discipline

- Worktree `tree/migration-consolidation-2026-11-23` (branch `migration-consolidation-2026-11-23`).
- Commit via the owning lane, finalize via the operator's normal flow; never touch sibling worktrees.

## Out of Scope (separate tickets — review only)

- **11 state-machine tickets** — app-layer + `COLUMN_TYPE_OVERRIDES` only, no migration needed.

## Acceptance Criteria

- [ ] 14 final-form migrations, 122 legacy files removed, 252 creates matching the manifest and the canonical golden dump.
- [ ] Fresh DB applies all 14 files; down() removes all tables; `consolidated-schema-equivalence.test.ts` passes.
- [ ] `db:sync-types` + `db:sync-manifest` byte-stable; `check-db-schemas.ts` and `schemas:check` green.
- [ ] Migration-coupled tests rewritten and green; `bun test -j 1 src/db/` and `bun test src/db/` green.
- [ ] `bun run check` green (or dev-identical baseline advisories).
- [ ] Worktree finalized by the operator's lane discipline.

## Docs-Gap Audit Remainders (2026-09-19)

- [ ] [gap-audit E4] Document migration authorship conventions: up/down pairing expectations + cross-version compatibility policy

## Final-form scope additions + edit-window grounding (2026-10-23)

The ratification of the pre-release edit window (owner-ratified
2026-10-23: "remove legacy approach support and regenerate db
completely"; grounding facts summarized in this section) folds the
following into the final-form requirements. Historical file-count
references elsewhere in `.plan` are stale superseded snapshots; the
approved baseline is the 14 files `001_core.ts` … `014_support_singletons.ts`
replacing the retired 122-file chain ending `122_unread_visible_counters.ts`.

- [ ] `message_translations` final form per
      `FEAT-message-translations-chat-first.md`: UNIQUE
      `(message_id, locale)`, encryption columns mirroring `messages`
      (`key_id`, `content_encoding`, `e2e_payload`, `e2e_session_id`,
      `e2e_sender_eph_pub_jwk`, `e2e_chain_index`, `content_plaintext`),
      optional `status`/`source_lang`
- [ ] `model_capabilities.native_locale` (nullable TEXT) final-form
      column per `FEAT-model-native-locale-config.md`
- [ ] Removing legacy `chats.story_state.autoTranslateLang` needs **no
      migration** — it is a JSON key inside the `chats.story_state` TEXT
      column; removal is app-level, stale keys simply stop being read

Edit-window grounding (2026-10-23, verified facts):

- Kysely migration identity is **filename-based with no checksum**
  (`kysely_migration` keyed by name; `assertMigrationsNotStale` trips
  only on delete/rename) — content edits to applied files diverge
  silently, which is why edits must be paired with full regeneration
  (`db:reinit`: archive + migrate + seed chain) while the window is
  open.
- **Zero git tags and no deployed DB anywhere** — no released binaries
  (release artifacts only on tag push; `0.1.0` deliberately untagged),
  no upgrade docs, no evidence of any DB outside developer checkouts.
- Everything materializes from the migration files: boot
  (`start.ts` runMigrations + seed), unit + roundtrip suites, e2e, and
  the text-parsing generators — no schema copy can drift.
- **Precedent**: the v0 collapse already replaced 23 forward migrations
  and 20 `parts/` modules with a single atomic `001_init.ts` under the
  same no-release conditions.
- The window is bounded by the **first signed tag**; after that,
  append-only applies verbatim and `assertMigrationsNotStale` remains
  the tripwire.
