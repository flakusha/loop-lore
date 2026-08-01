# TASK: Config Files for Gallery & File Attachment with Idempotent Load

**Priority:** Medium
**Status:** ✅ Done — SHA-256 hash-based duplicate detection implemented in `createAsset`; same file by same owner returns existing asset ID with HTTP 200 + `duplicate: true` flag
**Epic:** epic-config-extensions
**Tags:** config, gallery, file-attachment, idempotent, reload, asset

## Scope (narrowed 2026-08-01)

The original ticket proposed config files, hot-reload, versioning, and new API endpoints. Most of this is already handled by the existing config system (`src/config/`) and asset service (`src/assets/service.ts`). The concrete remaining gap is **idempotent upload** — hash-based duplicate detection so uploading the same file twice returns the existing asset ID instead of creating a duplicate.

## Remaining Work

- [ ] Hash-based duplicate detection on upload — compute file hash, check `asset_metadata` for existing match, return existing asset ID if found
- [ ] Frontend feedback when duplicate detected — toast "Asset already exists" with link to existing asset

## Already Implemented

- ✅ Upload API (`POST /api/assets`) — works, validates file types and sizes
- ✅ Config-driven validation — `src/config/schema.ts` has `assets.maxFileSize`, `assets.compression`
- ✅ Gallery browsing UI — grid + search + filter via HTMX
- ✅ File upload with drag-and-drop — `src/partials/gallery/upload-modal.html`

## Technical Notes

- Hash can be computed during upload (SHA-256 of file content)
- Store hash in `asset_metadata.metadata` JSON or add `content_hash` column
- Existing `asset_metadata` table already has `mime_type`, `file_size` — hash is natural extension
- Integrates with existing asset system (Epic: Asset Support Expansion)
