<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Transform routes validation and ownership authz

**Summary:** (none captured)
**Context:** (none captured)
**Summary:** CRUD endpoints for asset transforms guarded per repo ownership-check pattern. Part of epic-asset-platform-capabilities.md B1-B5.
**Context:** Transform routes (src/routes/assets/transforms/*) accept per-transform create/update/delete. Today they require login but not ownership-of-the-parent-asset — a logged-in user can mutate transforms on assets they don't own. Fix: every transform route resolves assetId -> ownerId and runs requireOwnOrAdmin(assetId) before the body is parsed. Validates the request body against AssetTransformSchema (idempotent upsert by (asset_id, scope)).
**Status:** open
**Priority:** medium
**Effort:** Medium
**Epic:** Asset Transform Editing + Metadata

## Summary

CRUD endpoints guarded per repo ownership-check pattern. Part of epic Asset Transform Editing + Metadata.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
