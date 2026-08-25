# BUG: Duplicate openAssetPreview definitions with divergent behavior

**Status:** 🔧 Fixed in worktree `fix-gallery-assets` (commits b6c232e5, 1b5de824)
**Priority:** high
**Effort:** Medium

## Summary

globalThis.openAssetPreview is defined twice: src/frontend/pages/gallery.ts (signed URLs, copy/download/delete) and src/frontend/asset-preview.ts (plain /raw, no actions). layout.html loads BOTH bundles (/alpine-init.js and /pages.js) on every page; last assignment wins silently. Also media-preview-modal.html copy/download buttons call window.copyAssetUrl/downloadAsset which read globalThis.__previewAsset — the chat flow sets Alpine previewMediaAsset and never `__previewAsset`, so buttons are dead in chat (or act on a stale gallery asset if one was opened earlier in the session). Fix: single implementation in asset-preview.ts used by both surfaces; make chat modal set `__previewAsset` or give the modal its own actions bound to its state.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
