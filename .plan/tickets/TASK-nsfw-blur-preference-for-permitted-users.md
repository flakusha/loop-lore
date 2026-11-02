<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: NSFW blur preference for permitted users

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Per-user preference (nsfw_user_preferences.nsfw_blur_media, migration 093) to render NSFW-flagged media (attachments via enrichAttachments, avatars via attachMessageAvatars, gallery grid/search via the asset_links-to-actor v1 rating signal) blurred with a client-side click-to-reveal when the viewer is already permitted. Settings toggle in the NSFW consent section persists via the preferences API plus a localStorage mirror; i18n keys in all 10 locales. Implemented on branch nsfw-blur-pref, commit 49fea0355.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-11-02 registry-driven close: git issue 91abe63 (registry tip: 23a9e3617 Konstantin Fedotov Close issue)
