<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Extend schema fuzz generation beyond src/validation/schemas

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-library-distribution.md

**Summary:**

scripts/generate-schema-fuzz.ts globs src/validation/schemas/*.ts and merges each module namespace. That directory was chosen because the route contracts live there, but TypeBox schemas are declared elsewhere in the tree, so those get no generated coverage.

Audit for t.Object / t.String / t.Union / t.Number / t.Literal call sites outside src/validation/ and decide per site whether it is a contract worth fuzzing. Candidates already known: src/config/schema.ts and its generated env.schema.json, any plugin-contributed route schemas under plugins/core/.

Two constraints learned the hard way on feat-auto-test-generation, both of which cost a silent-green gate:
- discover by reading the directory on disk, never by iterating a barrel — four schema modules sit beside src/validation/schemas/index.ts and are not re-exported from it, so a barrel-only walk missed 41 schemas while reporting a clean count
- disambiguate a schema name that repeats across modules by its owning module, or the emitted test silently resolves to whichever was imported first

Report findings before implementing: the point is to find which schemas are contracts, not to fuzz every t.Object in the tree.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
