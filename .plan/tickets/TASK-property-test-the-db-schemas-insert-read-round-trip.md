<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Property-test the db-schemas insert/read round-trip

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-api-library-distribution

**Summary:**

src/validation/db-schemas.ts is generated per table from column metadata, and scripts/check-coverage-db-schemas.ts verifies the schema manifest against the migration set. What neither does is insert a row built from the schema and read it back, so a column whose TypeBox type disagrees with its declared column type would only surface at runtime.

Property to assert: a payload built from the table schema's own arbitrary, inserted through Kysely and re-read, comes back deep-equal to what was inserted.

Input source is src/test-utils/schema-arbitrary.ts (schemaToArbitrary). Exclude columns with no sane round-trip (defaults applied server-side, JSON column key ordering, timestamps the driver rewrites) — enumerate them explicitly rather than widening an equality assertion until it passes.

This matters for the library-distribution epic specifically: an external consumer generating rows from the published schemas needs to know that schema-conformant input actually persists.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
