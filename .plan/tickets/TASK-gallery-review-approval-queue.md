<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Gallery Review & Approval Queue

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-frontend-gallery
**Related:** FEAT-in-chat-asset-preview-linkage-side-panel, BUG-gallery-openAssetPreview-context-safety
**git issue:** 69e421f

## Summary

Add a review/approval workflow for gallery assets: flag, approve, reject, and a
moderator review queue surface.

## Context

Gallery has 27 tickets and asset linkage is covered
(FEAT-in-chat-asset-preview-linkage-side-panel), but the review/approval path
(flag/report an asset, moderator approve/reject with persisted state, queue view)
has only incidental coverage (BUG-gallery-openAssetPreview-context-safety). No
ticket owns the review workflow. Identified as a gap in the core functionality
review (gallery, gallery linkage, review).

## Acceptance Criteria

- [ ] Flag/report action on an asset
- [ ] Moderator approve/reject with state persisted
- [ ] Review queue surface (moderator view)
- [ ] Permissions gating (only moderators act)
- [ ] `bun run check` green
