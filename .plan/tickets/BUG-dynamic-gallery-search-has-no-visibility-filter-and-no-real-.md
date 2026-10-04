<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Dynamic gallery search has no visibility filter and no real auth

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

POST /dynamic/gallery/search (src/views/search.ts:31) applies no visibility filtering and no real authentication; the dynamic plugin route plumbing (src/plugins/plugin-dynamic.ts:58-71) does not enforce the standard requireUserId/visibility gates used by the authenticated gallery views - any caller can search across other users' (including hidden/private) assets. Fix: route the dynamic search through the same auth + visibility scoping as the authenticated gallery; add tests proving cross-user/hidden exclusion.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

PARTIAL. Fixed on dev: serveGallerySearch now receives viewer identity (src/routes/views/plugin-dynamic.ts:65-70), applies tag owner-scope (src/routes/views/search.ts:56-71) and G6 visibility inheritance via inheritedHiddenAssetIds (src/routes/views/search.ts:79-88), hiding private-character assets. Still open: no requireUserId/auth gate - ctx.userId is cast and may be null (src/routes/views/plugin-dynamic.ts:68); and the query has no base visibility WHERE - src/routes/views/search.ts:31-33 selects all assets, unlike the grid's public/owned/shared + public-character filter (src/routes/views/gallery.ts:94-112), so private/shared-only non-character-linked assets still leak to any caller. No worktree touches these files functionally (git log --all on them: only lint/versioning/G6-from-August commits).
