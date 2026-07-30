# TASK: Asset Versioning System

**Status:** Not Started
**Priority:** Medium
**Epic:** epic-items
**Tags:** asset, versioning

## Summary

Implement asset versioning to track changes, enable rollbacks, and maintain history of asset modifications.

## Requirements

### Version Tracking

- New `asset_versions` table
- Each upload creates new version
- Version metadata: changelog, size, dimensions
- Current version pointer in `assets` table

### Version Management

- List all versions of an asset
- View version details (diff, metadata)
- Compare versions side-by-side
- Restore previous version

### Storage Optimization

- Incremental storage (delta only)
- Compression for old versions
- Cleanup policies for old versions

## Acceptance Criteria

- [ ] `asset_versions` table with version metadata
- [ ] Version creation on upload
- [ ] Version listing and browsing
- [ ] Version comparison (side-by-side)
- [ ] Version rollback/restore
- [ ] Incremental storage optimization
- [ ] Compression for old versions
- [ ] Unit tests for versioning logic
- [ ] Integration tests for version workflow

## Notes

- Reference `epic-items.md` for asset system design
- Consider storage costs vs. version retention
- Balance version history vs. cleanup
