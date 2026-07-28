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
- View specific version
- Rollback to previous version
- Delete specific version

### API Endpoints

- `GET /api/assets/:id/versions` — List versions
- `GET /api/assets/:id/versions/:version` — Get version
- `POST /api/assets/:id/versions` — Upload new version
- `PATCH /api/assets/:id/versions/:version` — Update version metadata
- `DELETE /api/assets/:id/versions/:version` — Delete version

## Implementation

1. Create `asset_versions` table migration
2. Extend `createAsset` to create version records
3. Add version endpoints to controller
4. Create version selector UI component
5. Update asset preview to show version history

## Files

- `src/db/migrations/019_asset_versions.sql` — Migration
- `src/assets/service.ts` — Version-aware create
- `src/assets/controller.ts` — Version endpoints
- `src/frontend/components/asset-version-modal.html`
