# FEAT: Configs path resolution — file-relative + Windows/macOS parity

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-configs-path-resolution

## Summary

Make config path resolution file-relative (resolve relative paths against the owning configs/ file's location, not the application cwd) and Windows/macOS-portable (node:path sep/isAbsolute, no /proc or /home assumptions, drive-letter support).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
