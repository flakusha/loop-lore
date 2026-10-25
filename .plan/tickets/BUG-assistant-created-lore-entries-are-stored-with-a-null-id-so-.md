<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Assistant-created lore entries are stored with a NULL id, so their cooldown never starts

**Status:** Done
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

**Summary:**

`insertEntityLore` inserts lore rows without an `id` column, and both lore tables declare `id` as a TEXT PRIMARY KEY with no database default — so every assistant-generated lore entry is stored with `id = NULL`. The cooldown write-back addresses rows by `id`, so it updates 0 rows and `last_activated` stays NULL forever.

**Evidence:**

- `src/assistant/commands/create-entity-lore.ts:182-199` — `insertInto("world_lore_entries")` / `insertInto("actor_lore_entries")` with a `loreValues` object that has no `id` key (`:157-180`).
- `src/db/migrations/001_init.ts:568` and `:882` — `id` is `addColumn("id", "text", (col) => col.primaryKey())`: TEXT PRIMARY KEY, no DEFAULT, no NOT NULL. SQLite permits NULL in a TEXT PRIMARY KEY, so the insert succeeds instead of failing.
- `src/db/schema-story.ts:91` and `:165` — `id: Generated<string>` on both tables. The generated type claims the DB supplies a default, so the omission type-checks and no lint rule flags it.
- Every other production insert site passes an id: `src/story/events/promote-lore.ts:111-113` (`id = randomUUID()`), `src/routes/import/lorebook.ts:30-33` (`id: uid()`), `src/routes/world-import/bundle.ts:169-171` (`id: uid()`). `insertEntityLore` is the only production writer that omits it.
- `src/assistant/prompt/sections/lore.ts:134-153` — the activation write-back is `.updateTable("actor_lore_entries").set({ last_activated: now }).where("id", "=", entry.id)` and the same for `world_lore_entries` (`:146-149`). `entry.id` comes from `src/assistant/prompt/sections/lore-load.ts:53,106` (it selects `id`). `id = NULL` is never true in SQL, so 0 rows are updated.
- `src/assistant/prompt/sections/lore-activation.ts:112-116` — `isCooldownExpired(lastActivated, cooldownSeconds)` returns true when `last_activated` is NULL, so the entry stays permanently eligible.

**Failure scenario:**

1. The user runs an assistant `/create` command for a world/character/location/item that carries structured lore with `cooldown_seconds: 3600` (a secret that should surface once per hour).
2. `insertEntityLore` stores the row; reading it back gives `id = null`.
3. The next prompt build loads that entry (`last_activated` is NULL), includes it in the `<lore>` section, and then tries to stamp the activation timestamps.
4. `UPDATE world_lore_entries SET last_activated = ?, last_verified = ? WHERE id = NULL` updates 0 rows. Both timestamps stay NULL.
5. Every later prompt re-injects the entry: the cooldown is silently never enforced, `last_verified` never advances (so the decay gate can never run on it), and the row can never be updated or deleted by id.

Probe-verified against the real migration chain: after `insertEntityLore` the row reads back `{ id: null, ... }` and the cooldown write-back matches 0 rows (`last_activated: null`, `last_verified: null`).

**Proposed fix:**

Pass an explicit id at the insert site — `id: uid()` in `src/assistant/commands/create-entity-lore.ts:157-180`, the same call the other lore writers use — and close the type hole that let the omission through: `id: Generated<string>` should be `id: string` for `world_lore_entries` / `actor_lore_entries` in `src/db/schema-story.ts:91,165` (plus the matching `src/db/generated/db-types.ts` entries) so a missing id is a compile error rather than a NULL row. Root-cause note: the same `Generated` assumption covers every TEXT PRIMARY KEY column in `src/db/schema-manifest.ts`; the generated type must not claim a DB default that no migration creates. See also `BUG-appeal-reversal-notification-is-stored-with-a-null-id-which-.md`, which is the same class of defect on a different table.

**Context:**

`insertEntityLore` was the only production lore writer that omitted `id`; every other writer (`promote-lore.ts`, `routes/import/lorebook.ts`, `routes/world-import/bundle.ts`) already passes one.

The fix has two halves:

1. The insert site now supplies `id: uid()` (`src/assistant/commands/create-entity-lore.ts:161`), matching the sibling writers. This closes the defect.
2. The type hole that let the omission compile (`id: Generated<string>` claims a DB default that no migration creates) is closed by the GENERATOR, not by a hand edit of the generated file — `src/db/schema-*.ts` is regenerated from the migration chain, so a hand edit would be reverted by the next `db:sync-types` run.

The generator half was owned by a separate branch (TASK-generated-db-types-mark-every-primary-key-as-db-generated-so, issue `db7edfa`) and was deliberately NOT part of this commit: the general rule change (`col.primaryKey` → not-`Generated`) breaks typecheck repo-wide, so it must land as its own change with its own sweep. That branch has since landed on dev (merge `5fc2dd436`, `fix(db): require ids for no-default primary keys`), so the type hole is closed upstream and `world_lore_entries.id` / `actor_lore_entries.id` are now `string` in the regenerated `src/db/schema-story.ts:91,165` — a future omission is a compile error. See "Resolution" for the cross-reference.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- Fix: `src/assistant/commands/create-entity-lore.ts:157-162` — `loreValues` now carries `id: uid()`, so every assistant-created lore row (both `world_lore_entries` and `actor_lore_entries`, which share the same values object) is stored with a non-null id. The insert-site change landed on dev first via the parallel branch `fix-db-types-required-pk` (merge `5fc2dd436`, byte-identical to this branch's version, so the merge is a no-op for it); this branch's commit carries the regression test and this ticket resolution.
- Type hardening is NOT in this commit: it belongs to TASK-generated-db-types-mark-every-primary-key-as-db-generated-so (issue `db7edfa`), which owns `scripts/generate-db-types.ts` and the generated `src/db/schema-*.ts`. That branch has since landed on dev (merge `5fc2dd436`): `world_lore_entries.id` / `actor_lore_entries.id` are now `string` in the regenerated `src/db/schema-story.ts:91,165`, so a future omission is a COMPILE ERROR. This commit supplies the insert-site fix and the regression test.
- Tests: `src/assistant/commands/create-entity-lore.test.ts` — "actor lore rows store a non-null id", "world lore rows store a non-null id", "the cooldown write-back stamps last_activated on the created row".
  - Before the fix: all 3 FAIL (`expect(received).not.toBeNull()` → `Received: null`; the cooldown write-back updated 0 rows because `WHERE id = NULL` never matches).
  - After the fix: 3 PASS (verified by temporarily removing the `id: uid()` line and re-running).
- The third test drives the real prompt section (`loreSection.build`) and asserts the row's `last_activated` flips from NULL to a timestamp — i.e. the cooldown write-back actually reaches the row by id, which is the behaviour the NULL id silently broke.

**Resolved:** 2026-10-25 registry-driven close: git issue b1ade27 (registry tip: e459c197c Konstantin Fedotov Auto-closed: appended .md marker marks BUG-ASSISTANT-CREATED-LORE-ENTRI)
