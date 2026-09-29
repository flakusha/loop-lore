<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — add migration-hygiene gate (duplicate numeric prefixes + unused parts/ pointers)

**Status:** In Progress
**Priority:** medium
**Effort:** Small
**Type:** Task
**Summary:** Duplicate-prefix detection and the `migrations - ordering` gate are DONE; the live `021` collision they caught is RESOLVED. What remains is narrow: cross-reference the 5 ghost `migrations/parts/` pointers in .plan/code-map.json against the filesystem, and document the gate in `src/db/migrations/README.md` § Migration hygiene. See ## RESOLVED for what changed and which earlier premises in this ticket were wrong.
**Context:** Open-debt.md § Migration hygiene #1 documents that `migrations/parts/` is the real schema source (`001_init.ts:11-40` ESM-imports every `parts/NNN_*.ts`), while `migrate.ts` readdirSync loader intentionally ignores `parts/`. code-map.json contains 5 keys referencing non-existent parts files (004_chats_actors, 005_actor_data, 006_messages_keys, 007_story_generation, 016_telemetry_events). #3 (combine-applied-migrations) is closed (append-only holds); #2 (duplicate prefixes) is open.

## Status correction (2026-09-28, DB-split review)

Both premises of this ticket are stale:

1. **The gate now exists** - `scripts/check-migration-ordering.ts` scans `src/db/migrations/*.ts` and already checks stray files, loader-scope order stability, and duplicate numeric prefixes. Step 1 is done; step 2 (wiring) is done - it runs as the `migrations - ordering` check gate.
2. **It was RED on `dev`** and had been, independent of any plan-doc work. Since resolved — see ## RESOLVED below:

   ```
   X loader scope: duplicate numeric prefixes (1):
       prefix 021:
         - src/db/migrations/021_game_states.ts
         - src/db/migrations/021_prompt_templates_workflow_modality.ts
   ```

   Reproduced with `bun run scripts/check-migration-ordering.ts` on a clean `dev` checkout.

Also stale: the Context paragraph describes a `migrations/parts/` tree that no longer exists, and the duplicate-prefix list (041x2 ... 054x2) predates the current 23-file series.

So the remaining work is not "add a gate" but "resolve the live `021` collision, then re-verify".

## RESOLVED (2026-09-29) — collision fixed, gate green

The `021` collision is resolved. `565680560 fix(db): renumber workflow migrations off duplicate 021` kept `021_game_states.ts` (older, unrelated) and moved the workflow pair to `022_prompt_templates_workflow_modality.ts` and `023_prompt_templates_workflow_columns.ts`.

`bun run scripts/check-migration-ordering.ts` on dev:

```
  ok loader scope: unique prefixes (24 prefixes across 24 files)
Migration ordering gate PASSED.
```

An earlier revision of this section asserted the two `021` files were "both shipped", making the fix "not a free renumber". That was wrong. The production database has four applied migrations and nothing at any `02x` prefix:

```
$ sqlite3 loop-lore-data/loop-lore.db "SELECT name FROM kysely_migration ORDER BY name;"
001_init
002_shadow_notes_visibility
003_memory_audit_log_action_check
004_shadow_notes_ttl_and_author_type

$ sqlite3 loop-lore-data/loop-lore.db "SELECT COUNT(*) FROM kysely_migration WHERE name LIKE '02%';"
0
```

The append-only rule forbids renumbering because *the filename is the identity stored in `kysely_migration`* — that binds only names that have actually run. Nothing at 021+ had run, so the renumber was free. A repo glob for `*.db` returns nothing because `loop-lore-data/` is gitignored: absence of a database in the tree is not evidence a migration is unshipped; query the file on disk.

**What is still open:** step 1's ghost-pointer cross-reference (5 `migrations/parts/` keys in `code-map.json` with no matching file) and the README documentation. The duplicate-prefix half needs no further work — the gate enforces it.

## Steps

Only the ghost-pointer half is outstanding. Steps 1a, 1b and 2 below are already implemented by `scripts/check-migration-ordering.ts` (run as the `migrations - ordering` gate); they are listed for traceability, not as work.

1. ~~Add a check step that scans `src/db/migrations/*.ts`, parses the numeric prefix, fails on duplicates~~ — DONE, already in `scripts/check-migration-ordering.ts`.
   - ~~Validates the next numeric prefix is `max(existing) + 1`~~ — not implemented; the gate checks uniqueness and order stability, not the next-number rule.
   - **OPEN:** Cross-reference `.plan/code-map.json` keys under `migrations/parts/` against the actual filesystem; report ghost pointers (5 today) as info (not warn — historical/ghost references are tolerated).
2. ~~Wire into `runNonBlockingChecks`~~ — DONE, it runs as the `migrations - ordering` gate.
3. **OPEN:** Document the gate in `src/db/migrations/README.md` § Migration hygiene.

**Acceptance Criteria:**

- [x] Check step added; `bun run check` exits non-zero when a duplicate numeric prefix is introduced.
- [ ] Ghost-pointer list (5 today) reported as info; cross-reference table shows historical reasons.
- [x] Gate wired into `runNonBlockingChecks`; output visible alongside other migration gates.
- [ ] Test added: a sample duplicate-prefix fixture (in a tmp dir, not committed) triggers the gate.
- [x] No impact on existing migration runs — the renumber was applied against a database with nothing at `02x` applied (see ## RESOLVED).

**Tags:** migration, hygiene, gate, code-map, schema-drift
**Related:** .plan/backlog/open-debt.md § Migration hygiene, .plan/code-map.json, src/db/migrations/README.md, scripts/check-migration-ordering.ts


git issue: 94870aa
