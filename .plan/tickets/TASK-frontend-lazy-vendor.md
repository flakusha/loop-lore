# TASK: Lazy-Load Vendor Chunks

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-frontend-bundle-optimization

## Summary

Split `vendor.js` (116K) into core vendor (loaded everywhere) and page-specific vendor (lazy-loaded). Currently htmx, Alpine.js, morph plugin, and htmx extensions are all bundled together.

## Strategy

- Core vendor: htmx + Alpine.js (loaded on every page)
- Page-specific vendor: morph plugin, htmx extensions (lazy-loaded per page)
- Chat vendor already separate — ensure consistent pattern

## Acceptance Criteria

- [ ] `vendor.js` < 50KB (core only)
- [ ] Page-specific vendor chunks lazy-loaded
- [ ] No vendor duplication across chunks
- [ ] All existing tests pass

## Files

- `src/frontend/vendor.ts` — split into core vs page vendor
- `src/frontend/chat-vendor.ts` — already separate, align pattern
- `scripts/build-frontend.sh` — update build config
