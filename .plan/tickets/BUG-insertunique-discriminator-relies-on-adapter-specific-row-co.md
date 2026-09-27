<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: insertUnique discriminator relies on adapter-specific row count

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Summary:** insertUnique relies on adapter-specific row count semantics; needs a guard SELECT for unambiguous inserted/skipped discrimination.
**Context:** Caught from post-merge audit of commit ba2871422 (register path). insertUnique is dialect-agnostic but PG reports inconsistent row counts across adapter versions for partial unique indexes.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

src/db/upsert-helpers.ts insertUnique reads result[0].numInsertedOrUpdatedRows to discriminate 'inserted' vs 'skipped'. The current SQLite path works (Bun returns {changes} which Kysely's SqliteDialect maps correctly), but the helper is dialect-agnostic and the PG path reports inserted-vs-attempted rows inconsistently across adapter versions for partial unique indexes. Add a guard SELECT on a unique-by-conflict-column (e.g. username) after the insert to make the discriminator unambiguous across SQLite and PG. Caught from post-merge audit of ba2871422.

## Context

Caught during post-merge audit of commit ba2871422 (register path). insertUnique currently relies on adapter-specific row-count semantics that diverge between SQLite and Postgres for partial unique indexes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
