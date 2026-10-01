<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: migration-hygiene ticket falsely claims 021 migrations are shipped

**Status:** Done
**Priority:** medium
**Effort:** Small
**Type:** Bug
**Summary:** `TASK-backlog-migration-hygiene-duplicate-prefix-gate.md` asserts the two `021` migrations are "both shipped", making the fix "not a free renumber". That is false: the production DB has 4 applied migrations and zero at any `02x` prefix, so the renumber was free. The ticket also still reads "Not Started" and "currently RED on `dev`" for a collision that is now resolved with the gate green.
**Context:** Found while reviewing the DB-split plan filing. The append-only rule in `src/db/migrations/README.md` forbids renumbering because *the filename is the identity stored in `kysely_migration`* — that binds only names that have actually run. Note the premise is easy to get wrong: a repo glob for `*.db` returns nothing because `loop-lore-data/` is gitignored, so absence of a DB in the tree is NOT evidence a migration is unshipped; you must query the file on disk.
**Acceptance Criteria:** The "both shipped" sentence is replaced with the queried evidence; the ticket no longer reads "Not Started" / "currently RED" for a resolved collision; the genuinely open items (ghost-pointer cross-reference, README docs) are retained; and `bun run plan:validate` passes.

## Evidence

```
$ sqlite3 loop-lore-data/loop-lore.db "SELECT name FROM kysely_migration ORDER BY name;"
001_init
002_shadow_notes_visibility
003_memory_audit_log_action_check
004_shadow_notes_ttl_and_author_type

$ sqlite3 loop-lore-data/loop-lore.db "SELECT COUNT(*) FROM kysely_migration WHERE name LIKE '02%';"
0
```

The collision itself is fixed and the gate is green:

```
$ bun run scripts/check-migration-ordering.ts
  ok loader scope: unique prefixes (24 prefixes across 24 files)
Migration ordering gate PASSED.
```
