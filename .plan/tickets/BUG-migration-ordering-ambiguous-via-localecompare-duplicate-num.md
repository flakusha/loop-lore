# BUG: Migration ordering ambiguous via localeCompare + duplicate numeric prefixes

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/db/migrate.ts:26 — migration apply order uses localeCompare on filename; duplicate prefixes 041_*, 054_*, 057_* make pair order alphabetical/ambiguous. Fix: enforce unique numeric prefixes (gate) and sort numerically. Related minors: readdirSync picks up stray .ts files (filter /^\d{3}_.*\.ts$/); numbering gap at 061; down() policy undocumented for migrations >=010.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
