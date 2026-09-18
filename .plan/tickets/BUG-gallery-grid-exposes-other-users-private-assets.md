<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Gallery grid exposes other users' private assets

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** fixed-in-worktree
**Priority:** high
**Effort:** Medium

## Summary

serveGalleryGrid (src/routes/views/gallery.ts) selects ALL assets with limit(200) and no visibility filter, while the JSON API listAssets filters public/owned/shared. Verified by probe: grid HTML for user bob contains alice's PRIVATE asset. Any authenticated viewer sees all users' private assets on /gallery. Fix: apply the same visibility filter (or reuse listAssets) in serveGalleryGrid; add regression test asserting bob cannot see alice's private asset in grid output.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
