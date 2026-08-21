<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: gallery serveGalleryGrid declared twice — build error

**Status:** Open
**Priority:** high
**Effort:** Trivial
**Area:** gallery
**Source:** reconcile review (Scout Batch C — GAL-1)

## Evidence

`src/routes/views/gallery.ts:58` and `src/routes/views/gallery.ts:101` — `async function serveGalleryGrid(...)` is declared twice. TypeScript/Bun errors "Duplicate identifier 'serveGalleryGrid'" at compile time.

## Impact

Build fails; gallery grid cannot be served. Site likely broken at `/gallery`.

## Fix

Delete the first declaration at line 58 (local helper), keep only the second (exported) one at line 101.

## Verification

- `bun run check` (tsc) passes after fix.
- Run `bun run dev` → GET /gallery → 200.

## Acceptance Criteria

- [ ] `serveGalleryGrid` declared exactly once
- [ ] Build clean
- [ ] Gallery page loads
