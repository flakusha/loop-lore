<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: gallery serveGalleryGrid declared twice — build error

**Status:** ✅ Closed (2026-08-22, verified on `dev`)
**Priority:** high
**Priority Tier:** P2
**Effort:** Trivial
**Area:** gallery
**Source:** reconcile review (Scout Batch C — GAL-1)
**Resolved:** 2026-08-21 (analysis) / 2026-08-22 (verification on `dev`)

## Verification (2026-08-22, `dev` @ 0e31e903)

`bun run check` passes 21/21 on the current `dev` tree. The check failure that
originally prompted this ticket (`no-restricted-syntax` on `extractSplitBranches` /
`extractReunionSource`) is unrelated to `serveGalleryGrid` and is no longer
blocking the gate. No duplicate `serveGalleryGrid` declaration exists; the
function is defined exactly once at `src/routes/views/gallery.ts:58-102`.

## Resolution

There is exactly ONE `serveGalleryGrid` declaration in `src/routes/views/gallery.ts:58-102`.
The ticket claimed a second declaration at line 101, but line 101 is `function renderCards(...)`.
No duplicate exists; no build error from this file.

The check failure that triggered this ticket (`src/routes/views/gallery.ts` appears in `bun run check`
output) is from a different lint issue — `no-restricted-syntax` in `extractSplitBranches` /
 `extractReunionSource` functions, unrelated to `serveGalleryGrid`.

## Verification

```bash
rg "function serveGalleryGrid|async function serveGalleryGrid|export.*serveGalleryGrid" src/routes/views/gallery.ts
# Only one match at line 58
```
