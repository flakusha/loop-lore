<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: SqliteDialect reader detection classifies SQL by leading keywords, misrouting EXPLAIN/commented/CTE-DML

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

The read-vs-write decision in `src/db/index.ts:48-51` is inferred from the first three uppercase characters of the SQL text:

```ts
get reader() {
  const s = sql.trim().toUpperCase();
  return s.startsWith('SELECT') || s.startsWith('WITH') || s.startsWith('PRAGMA');
}
```

Kysely's `SqliteConnection.executeQuery` (node_modules/kysely/dist/dialect/sqlite/sqlite-driver.js:56-70) branches on this flag: `true` -> `stmt.all(parameters)` returning `{rows}`; `false` -> `stmt.run(parameters)` returning `{insertId, numAffectedRows, rows: []}`.

Verified against the real dialect (.tmp/reader-detection-probe.ts, run on branch chore-file-concern-tickets):

```
plain SELECT (control)               reader=true  kysely=rows=3         bun=run(changes=0)
EXPLAIN SELECT                       reader=false kysely=rows=0         bun=run(changes=0)
leading comment then SELECT          reader=false kysely=rows=0         bun=run(changes=0)
leading block comment then SELECT    reader=false kysely=rows=0         bun=run(changes=0)
VALUES as standalone select          reader=false kysely=rows=0         bun=run(changes=0)
WITH ... INSERT (write, WITH-prefixed) reader=true  kysely=rows=0         bun=run(changes=1)
```

Three concrete misclassifications, in both directions:

1. Read -> write. `EXPLAIN SELECT ...`, `VALUES (1),(2)`, and any SELECT preceded by a comment or leading whitespace that is not a bare keyword (`.tmp/raw-trigger-probe.ts`) take the write path. A leading-newline SELECT returns `rows=undefined` through Kysely instead of rows.

2. Write -> read, and SILENTLY. `WITH x AS (...) INSERT ...` / `UPDATE ...` / `DELETE ...` starts with WITH, so `reader` is true, Kysely calls `stmt.all()` on a DML statement, and the result set comes back as zero rows with `insertId` and `numAffectedRows` undefined. The probe shows the row IS written (table grows 3 -> 4) but every write-reporting field is dropped, so callers see a successful empty result. This is the dangerous direction: the existing insert-vs-skip discriminators in `src/db/upsert-helpers.ts` (BUG-insertunique-discriminator-relies-on-adapter-specific-row-co, BUG-insertunique-probe-misreports-skip-as-inserted-when-conflict) read exactly those fields.

3. The prefix must be a bare keyword, so any hint or optimizer-directive form (`/*+ INDEX(t idx) */ SELECT ...`) also falls to the write path.

Note: `bun:sqlite`'s `Statement` has no `reader` property of its own (.tmp/bun-native-reader-probe.ts shows it is `undefined` for every statement including plain `SELECT`), which is why the wrapper re-derives it. So the fix is not a one-line delegate to the native flag. Options: classify on the parsed statement kind via `sqlite3_column_count`/`sqlite3_stmt_readonly`, or scope the check to reject known-write CTEs by inspecting the DML keyword after the CTE list. At minimum add regression tests for the three cases above.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
