# TASK: gallery-review minors sweep (pagination, sync IO, formatSize dedupe, any-typing)

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

Low-severity ride-along findings from the gallery/assets review, consolidated for tracking. Fix opportunistically when touching each file:\n1. Grid pagination UI: serveGalleryGrid supports a page param but no pager UI; >200-asset galleries truncate silently.\n2. Blocking IO: files.ts/read.ts use readFileSync per request on the serve path; move to async if asset traffic grows.\n3. formatSize triplicated across pages/shared, asset-preview, routes/views; consolidate to one helper.\n4. chat-utils/gallery.ts: getMediaStyle(asset: any)/openMediaPreview(asset: any) typed any (banned pattern); openMediaPreview silently no-ops for audio/video.\nNo behavior urgency; each is a small localized change.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
