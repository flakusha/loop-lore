# TASK: SQLite Backup Mechanisms Research

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low
**Epic:** epic-db-asset-snapshot-recovery

## Summary

Research SQLite backup mechanisms in Bun runtime. Determine if `bun:sqlite` supports `.backup()` API, WAL archiving, and point-in-time recovery. Document capabilities and limitations.

## Research Questions

1. Does `bun:sqlite` expose SQLite's `.backup()` API?
2. Can we archive WAL segments for incremental recovery?
3. What locks are required for consistent backups?
4. Is `VACUUM INTO` supported for file-based backups?
5. Can we snapshot without blocking writes?

## Deliverable

Document in `docs/meta/db-backup-research.md`:

- Bun SQLite backup capabilities
- Recommended backup strategy
- Limitations and workarounds

## Risk

Low — research only, no code changes.

## Related

- `src/db/` — current DB implementation
- `src/config/sections/database.ts` — DB config
