# TASK: Gallery asset reuse picker for world/location/item creation

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

No creation flow for worlds, locations, or items supports reusing an existing gallery asset: routes/worlds/worlds.ts touches asset_links only on delete; entity-routes/location-explorer/actor-items/story-items have zero asset integration. Character create accepts a fresh upload only (no pick-existing). Build a shared asset-picker component (browse own/shared/public assets, select, link with entityType/entityId/label) and wire it into world/location/item create+edit forms and character setup flows. Reuse the existing linkAsset service API.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
