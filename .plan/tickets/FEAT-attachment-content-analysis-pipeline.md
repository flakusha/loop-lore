<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Attachment Content Analysis Pipeline

**Status:** ✅ Done (duplicate — remainder extracted, 2026-09-19)
**Priority:** medium
**Effort:** Large
**Summary:** Attachment Content Analysis Pipeline
**Context:** Epic proposed:epic-attachment-moderation; tags attachments, moderation.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** proposed:epic-attachment-moderation
**Tags:** attachments, moderation

## Summary

Auto-caption on upload, configurable per chat/world; image moderation hook for visual NSFW/violence/PII.
Source: docs/meta/reviews/review-topics.md §11.

## Resolution

Core scope tracked by src/frontend/alpine/chat-actions/media.ts captioning; epic-asset-platform-capabilities.md:148-152. Unplanned remainder extracted 2026-09-19 → E22 visual NSFW/PII upload-analysis hook (epic-asset-platform-capabilities.md) (docs-gap reconcile audit).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
