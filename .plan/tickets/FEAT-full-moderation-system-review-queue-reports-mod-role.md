<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Full Moderation System (Review Queue, Reports, Mod Role)

**Status:** ✅ Done (duplicate — remainder extracted, 2026-09-19)
**Priority:** high
**Effort:** XL
**Summary:** Full Moderation System (Review Queue, Reports, Mod Role)
**Context:** Epic proposed:epic-admin-moderation; tags moderation, admin.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** proposed:epic-admin-moderation
**Tags:** moderation, admin

## Summary

Implement moderator role, review queue (approve/reject/escalate), content report endpoint (POST /api/moderation/report), configurable auto-mod rules, user-level mute/timeout/warn, mod event log, dedicated mod dashboard tab.
Distinct from NSFW moderation — general content moderation layer.
Source: docs/meta/admin-visibility-research.md.

## Resolution

Core scope tracked by src/chat/service/access-moderation.ts, src/routes/nsfw-moderation/, epic-chat-lifecycle-moderation.md. Unplanned remainder extracted 2026-09-19 → E12 /api/moderation/report + auto-mod rules + mod dashboard tab (epic-chat-lifecycle-moderation.md) (docs-gap reconcile audit).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
