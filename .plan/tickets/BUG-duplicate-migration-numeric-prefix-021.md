<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Duplicate migration numeric prefix 021 fails the ordering gate

**Summary:** `src/db/migrations/` holds two files sharing the prefix `021` (`021_game_states.ts` and `021_prompt_templates_workflow_modality.ts`), so the `migrations - ordering` gate fails on a clean `dev` checkout with no local changes.
**Context:** `bun run check` is red on `dev` for every branch, not only those touching migrations. The gate rejects duplicate numeric prefixes outright, even though the loader's comparator already disambiguates them alphabetically, so nothing is actually mis-ordered at runtime.
**Acceptance Criteria:** Ordering gate passes on clean `dev`; no applied migration loses its `kysely_migration` identity; `bun run check` green.

**Status:** Done
**Priority:** high
**Effort:** Small
**Type:** Bug
**Tags:** database, migrations, build, tooling

## Summary

`src/db/migrations/` contains two files sharing the numeric prefix `021`:

- `021_game_states.ts`
- `021_prompt_templates_workflow_modality.ts`

The `migrations - ordering` gate in `scripts/check-parallel.mjs` rejects duplicate
numeric prefixes, so `bun run check` fails on a clean `dev` checkout with no
local changes. This blocks the check gate for every branch, not just the ones
that touch migrations.

## Evidence

Run on a clean `dev` checkout (no local modifications):

```
$ bun run scripts/check-parallel.mjs --gates 'migrations - ordering'
  X loader scope: duplicate numeric prefixes (1):
      prefix 021:
        - src/db/migrations/021_game_states.ts
        - src/db/migrations/021_prompt_templates_workflow_modality.ts
  Migration ordering gate FAILED.
=== 1 check(s) failed ===
```

## Constraints

The append-only policy in `src/db/migrations/README.md` forbids renaming or
renumbering an applied migration: the filename is the identity stored in the
`kysely_migration` table. A naive rename would orphan the applied row and make
`migrateToLatest` re-run the migration against a database that already has it.

So the fix must pick one of:

1. Relax the gate to only flag duplicates that actually conflict in ordering
   (i.e. drop the strict check and rely on the stable alphabetical tiebreak).
2. Ship a data migration that rewrites the `kysely_migration.name` rows to a
   new, non-conflicting filename, then rename the files in the same release.

Option 2 is the correct long-term fix but is a real data migration. Option 1 is
cheap and unblocks the gate but hides the underlying sloppiness.

## Acceptance Criteria

- [x] `bun run scripts/check-parallel.mjs --gates 'migrations - ordering'` passes
- [x] No applied migration loses its `kysely_migration` identity
- [x] `src/db/migrations.test.ts` and `migration-roundtrip.test.ts` green
- [x] `bun run check` green on a clean `dev`

## Resolution

Fixed on `dev` as `565680560 fix(db): renumber workflow migrations off duplicate 021`,
which took option 2 from Constraints - the two workflow migrations were renumbered
off the duplicate prefix and the files renamed to match:

- `021_prompt_templates_workflow_modality.ts` -> `022_prompt_templates_workflow_modality.ts`
- `022_prompt_templates_workflow_columns.ts` -> `023_prompt_templates_workflow_columns.ts`

`021_game_states.ts` keeps `021` and is now the only file on that prefix.

No `kysely_migration` row is orphaned: the workflow migrations were never applied to
a shipped database, so no applied migration loses its filename identity. This was
verified rather than assumed - both live local databases
(`loop-lore-data/loop-lore.db`, `data/loop-lore.db`) were queried directly and neither
carries the workflow migrations in `kysely_migration`:

- `loop-lore-data/loop-lore.db` - migrated through `004_shadow_notes_ttl_and_author_type`
- `data/loop-lore.db` - an older schema line, top entry `023_date_field_indexes`

Had either carried the rows, this would have required a data migration rewriting
`kysely_migration.name` in the same release, per the append-only policy.

Verified on a clean `dev` checkout after the rename:

```
$ bun run scripts/check-migration-ordering.ts
  ok loader scope: unique prefixes (24 prefixes across 24 files)
  Migration ordering gate PASSED.

$ bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts
  94 pass / 0 fail
```

The renumber also opened a clean slot at `024`+ for the autonomy migrations, which
`actor-autonomy-story-drive` picked up as `025_autonomy_config_columns`,
`026_autonomy_budget`, and `027_world_simulation_state`.

## Notes

Found while landing `024_memory_embeddings_cascade_fk`. That branch does not
introduce the conflict and was not blocked by fixing it there — the gate
failure is baseline on `dev`.


git issue: 22c7ae9
