<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — add migration-hygiene gate (duplicate numeric prefixes + unused parts/ pointers)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Type:** Task
**Summary:** Per open-debt.md § Migration hygiene #2, duplicate numeric prefixes (041×2, 042×2, 044×2, 046×3, 047×3, 054×2) are unenforced today. The next migration must take 057 and numbers must never be reused. This ticket is the check-gate addition that prevents future duplicate-prefix regressions and validates the migration parts/ pointers that .plan/code-map.json references but don't exist as files (5 historical/ghost pointers).
**Context:** Open-debt.md § Migration hygiene #1 documents that `migrations/parts/` is the real schema source (`001_init.ts:11-40` ESM-imports every `parts/NNN_*.ts`), while `migrate.ts` readdirSync loader intentionally ignores `parts/`. code-map.json contains 5 keys referencing non-existent parts files (004_chats_actors, 005_actor_data, 006_messages_keys, 007_story_generation, 016_telemetry_events). #3 (combine-applied-migrations) is closed (append-only holds); #2 (duplicate prefixes) is open.

## Status correction (2026-09-28, DB-split review)

Both premises of this ticket are stale:

1. **The gate now exists** - `scripts/check-migration-ordering.ts` scans `src/db/migrations/*.ts` and already checks stray files, loader-scope order stability, and duplicate numeric prefixes. Step 1 is done; step 2 (wiring) is done - it runs as the `migrations - ordering` check gate.
2. **It is currently RED on `dev`** and has been, independent of any plan-doc work:

   ```
   X loader scope: duplicate numeric prefixes (1):
       prefix 021:
         - src/db/migrations/021_game_states.ts
         - src/db/migrations/021_prompt_templates_workflow_modality.ts
   ```

   Reproduce with `bun run scripts/check-migration-ordering.ts` on a clean `dev` checkout.

Also stale: the Context paragraph describes a `migrations/parts/` tree that no longer exists, and the duplicate-prefix list (041x2 ... 054x2) predates the current 23-file series.

So the remaining work is not "add a gate" but "resolve the live `021` collision, then re-verify". Note the constraint: `021_game_states.ts` and `021_prompt_templates_workflow_modality.ts` are both shipped, so under the append-only policy the fix is a rename/renumber decision with live-database implications, not a free renumber.

## Steps

1. Add a check step in scripts/check/ that:
   - Scans `src/db/migrations/*.ts` (excluding `parts/`), parses the numeric prefix of each filename, and fails if any prefix is duplicated.
   - Validates that the next numeric prefix is `max(existing) + 1`.
   - Cross-references .plan/code-map.json keys under `migrations/parts/` against the actual filesystem; reports ghost pointers (5 today) as info (not warn — historical/ghost references are tolerated).
2. Wire into `runNonBlockingChecks` next to existing migration-ordering check (`scripts/check-migration-ordering.ts`).
3. Document the gate in `src/db/migrations/README.md` § Migration hygiene.

**Acceptance Criteria:**

- [ ] Check step added; `bun run check` exits non-zero when a duplicate numeric prefix is introduced.
- [ ] Ghost-pointer list (5 today) reported as info; cross-reference table shows historical reasons.
- [ ] Gate wired into `runNonBlockingChecks`; output visible alongside other migration gates.
- [ ] Test added: a sample duplicate-prefix fixture (in a tmp dir, not committed) triggers the gate.
- [ ] No impact on existing migration runs (the 62/62 live DB names must continue to match source).

**Tags:** migration, hygiene, gate, code-map, schema-drift
**Related:** .plan/backlog/open-debt.md § Migration hygiene, .plan/code-map.json, src/db/migrations/README.md, scripts/check-migration-ordering.ts


git issue: 94870aa
