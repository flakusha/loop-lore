<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: insertUnique discriminator relies on adapter-specific row count

**Status:** Done (commit 3b361a1a4 — disambiguator at src/db/upsert-helpers.ts:216-238, probe SELECT on conflict columns with tenant-leak guard.)
**Priority:** medium
**Effort:** Medium
**Summary:** src/db/upsert-helpers.ts insertUnique read `result[0].numInsertedOrUpdatedRows` to discriminate 'inserted' vs 'skipped'. The current SQLite path works (Bun returns `{changes}` which Kysely's SqliteDialect maps correctly), but the helper is dialect-agnostic and the PG path reports inserted-vs-attempted rows inconsistently across adapter versions for partial unique indexes. Add a guard SELECT on a unique-by-conflict-column (e.g. username) after the insert to make the discriminator unambiguous across SQLite and PG. Caught from post-merge audit of ba2871422.
**Context:** Filed as a followup to BUG-register-non-atomic-user-actor-key-insert (commit a14ebc174). The two followups sat unaddressed while the data-corruption path was prioritized. Addressed in the register-idempotency-tx worktree (finalized 2026-09-27, merged to dev as 3b361a1a4 plus the 3f6329b02 size refactor).
**Acceptance Criteria:**

- [x] Implementation complete — probe SELECT in src/db/upsert-helpers.ts:216-238 disambiguates insert-vs-skip by selecting the row at the conflict columns and comparing its id to the inserted id. Tenant-leak guard (the F5 fix from the post-merge review): if every conflict column has an undefined value, the probe would degenerate to `SELECT id FROM table LIMIT 1` and leak across tenants; the early `return "skipped"` short-circuits before that.
- [x] Tests passing — `src/db/upsert-helpers.test.ts` adds the "probe on the skip path reports 'skipped' when the row pre-exists" regression test. 47/47 tests pass on the touched files (upsert-helpers.test.ts + rate-limit.test.ts + auth.test.ts).
- [x] Documentation updated — the dialect-portability caveat block at src/db/upsert-helpers.ts:165-187 explains the PG partial-unique-index problem the probe solves.

## Implementation Notes

Disambiguation: the helper returns `"inserted"` only when the probe finds a row whose id matches the inserted id. If the probe finds a row at a different id, the helper returns `"skipped"` (a different user won the conflict, retry path). If the probe finds no row at all, both branches are ambiguous — return `"skipped"` so the caller retries (the next probe will re-validate).

Why one probe, not two: a single indexed lookup is O(1) on the conflict columns (they're a unique index by construction). Two probes would cost a second round-trip with no extra information.

Test note: the new test seeds a row at a random UUID, then attempts to insert a second row at the same username. The probe path runs only when the DO NOTHING skip reports numInsertedOrUpdatedRows=0 — exactly the path the original helper got wrong on PG partial-unique indexes. Verified against the SQLite test dialect as a portable proxy for the PG edge case.
