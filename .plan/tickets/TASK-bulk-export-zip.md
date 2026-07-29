# TASK: Bulk Export (ZIP Archive)

**Status:** ⬜ Deferred to v2\
**Priority:** Medium\
**Effort:** Medium\
**Epic:** epic-import-export-io\
**Linked Tickets:** TASK-import-export-io.md

## Summary

Implement bulk export functionality that creates ZIP archives containing multiple character cards, chat logs, and associated assets for full backup/restore capability.

## Acceptance Criteria

- [ ] ZIP archive creation with proper structure
- [ ] Multiple character cards in single export
- [ ] Chat logs included in export
- [ ] Assets bundled with export
- [ ] Progress reporting during export

## Technical Notes

- Use native Bun APIs for ZIP creation
- Consider memory usage for large exports
- Add progress events for long-running operations
- Defer to v2 after core import/export stabilizes
