# Epic: DB Content Versioning & Migrations Reconciliation

**Status:** 📝 Draft
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** database, migrations, versioning, schema, data-integrity

## Overview

Track DB schema version, content format versions, fix migration gaps. Ensures the database schema and content formats are versioned and migrations are documented and tested.

## Reference

- Spec: `docs/spec/db-versioning.md`
- Future features plan: `docs/meta/future-features-plan.md` (Tier 2)

## Features

| Feature | ID | Effort | Description |
| ------- | -- | ------ | ----------- |
| Schema version table | FEA-2026-040 | Low | `schema_version` table + queryable getter |
| Migration reconciliation | FEA-2026-041 | Med | Document gaps (002-007), add migration index doc |
| Content versioning framework | FEA-2026-042 | Med | Registry + batch runner for `data_version` columns |
| Migration testing | FEA-2026-043 | Med | Validate migrations against :memory: schemas |
| Migration documentation | FEA-2026-044 | Low | `docs/spec/migrations.md` with full index |

## Acceptance Criteria

- [ ] `schema_version` table exists and is queryable
- [ ] Migration gaps documented in `docs/spec/migrations.md`
- [ ] Content versioning registry implemented
- [ ] Migration tests pass against :memory: schemas
- [ ] All migrations documented with index

## Dependencies

- DB schema (existing)
- Migration system (existing)
