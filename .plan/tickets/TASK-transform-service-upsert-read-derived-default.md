<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Transform service upsert read derived-default

**Summary:** (none captured)
**Context:** (none captured)
**Summary:** Service-layer upsert + read for asset transforms; the read path returns a derived-default transform when the user has not customized one (focal-point auto-seed on upload per `epic-asset-platform-capabilities.md` B1). Part of `epic-asset-platform-capabilities.md` B1-B5.
**Context:** Today the asset upload pipeline creates a transform row only if the user explicitly opts in (focal-point picker). Users who skip the picker get no transform record, which breaks cover/crop heuristics in the gallery. The derived-default path inserts a transform with `source: "auto-seed"`, focal-point = entropy-center-of-image, and crop = none; subsequent reads return the user override OR fall back to the derived default. Auto-seed runs at upload completion in `assets.upload-complete.ts`.
**Status:** open
**Priority:** medium
**Effort:** Medium
**Epic:** Asset Transform Editing + Metadata

## Summary

Including focal-point auto-seed on upload. Part of epic Asset Transform Editing + Metadata.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
