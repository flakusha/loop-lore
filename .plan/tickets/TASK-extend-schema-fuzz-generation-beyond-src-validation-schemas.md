<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Extend schema fuzz generation beyond src/validation/schemas

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-library-distribution

**Summary:**

scripts/generate-schema-fuzz.ts globs src/validation/schemas/*.ts and merges each module namespace. That directory was chosen because the route contracts live there, but TypeBox schemas are declared elsewhere in the tree, so those get no generated coverage.

Audit for t.Object / t.String / t.Union / t.Number / t.Literal call sites outside src/validation/ and decide per site whether it is a contract worth fuzzing. Candidates already known: src/config/schema.ts and its generated env.schema.json, any plugin-contributed route schemas under plugins/core/.

Two constraints learned the hard way on feat-auto-test-generation, both of which cost a silent-green gate:
- discover by reading the directory on disk, never by iterating a barrel — four schema modules sit beside src/validation/schemas/index.ts and are not re-exported from it, so a barrel-only walk missed 41 schemas while reporting a clean count
- disambiguate a schema name that repeats across modules by its owning module, or the emitted test silently resolves to whichever was imported first

Report findings before implementing: the point is to find which schemas are contracts, not to fuzz every t.Object in the tree.

**Context:**

The schema-fuzz generator (`scripts/generate-schema-fuzz.ts`) is scoped to `src/validation/schemas/` — the directory that was known to hold route contracts at the time. TypeBox schemas also live in `src/config/schema.ts` (env config, not a route contract) and `plugins/core/` (plugin-contributed routes, also contracts). Leaving these out means zero fuzz coverage for those wire surfaces, which is exactly the class of bug schema-fuzz was built to catch.

Two hard lessons from `feat-auto-test-generation` apply: (1) barrel-only walks miss sibling modules not re-exported in `index.ts` — disk glob, not import graph traversal; (2) schema names colliding across modules silently resolve to whichever is imported first in the generated test, so each collision must be disambiguated by owning module. Both caused silent-green gates.

Constraint: not every `t.Object` in the tree is a fuzz-worthy contract. `src/config/schema.ts` env schemas are internal defaults, not wire contracts. Plugin schemas are contracts only if they represent external-facing routes. An audit must precede the implementation to classify each candidate.

Alternative: do nothing and accept zero coverage for out-of-tree schemas. Accepted for `src/config/schema.ts` (internal). Not acceptable for plugin route schemas (external surface). The ticket is scoped accordingly.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
