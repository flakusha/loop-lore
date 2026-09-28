<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Duplicate migration numeric prefix 021 fails the ordering gate

**Summary:** `src/db/migrations/` holds two files sharing the prefix `021` (`021_game_states.ts` and `021_prompt_templates_workflow_modality.ts`), so the `migrations - ordering` gate fails on a clean `dev` checkout with no local changes.
**Context:** `bun run check` is red on `dev` for every branch, not only those touching migrations. The gate rejects duplicate numeric prefixes outright, even though the loader's comparator already disambiguates them alphabetically, so nothing is actually mis-ordered at runtime.
**Acceptance Criteria:** Ordering gate passes on clean `dev`; no applied migration loses its `kysely_migration` identity; `bun run check` green.

**Status:** Not Started
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

- [ ] `bun run scripts/check-parallel.mjs --gates 'migrations - ordering'` passes
- [ ] No applied migration loses its `kysely_migration` identity
- [ ] `src/db/migrations.test.ts` and `migration-roundtrip.test.ts` green
- [ ] `bun run check` green on a clean `dev`

## Notes

Found while landing `024_memory_embeddings_cascade_fk`. That branch does not
introduce the conflict and was not blocked by fixing it there — the gate
failure is baseline on `dev`.


git issue: 22c7ae9
