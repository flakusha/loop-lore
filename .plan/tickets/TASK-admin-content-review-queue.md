# TASK: Admin Content Review Queue

**Status:** ✅ Done — BE `src/routes/admin/review-stats.ts` (pending/total/dismissed/resolved/falsePositiveRate/daily/topContentTypes) reusing pre-existing `/api/nsfw/moderation/flags` backend; FE `admin-review.ts` + Review tab in `admin.html`
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-admin
**Spec:** `docs/frontend/admin.md` §Content Review

## Summary

Moderation queue for flagged content (messages, assets, notes) with admin review actions. Flag button on messages/assets via context menu; review queue with keep / add spoiler tag / delete / mute user / dismiss; configurable auto-moderation rules; moderation statistics.

## Backend

- Flag endpoint: `POST /api/admin/flags` (or per-entity flag routes) — reason presets + custom, reporter id, entity ref
- Review queue: `GET /api/admin/review` (pending/reviewed/dismissed, filters by type/status)
- Review actions: `POST /api/admin/review/:flagId` — keep | add-spoiler | delete | mute-user | dismiss
- Auto-moderation rules (configurable): max-flags-before-auto-hide, profanity filter, spam detection, spoiler auto-tag
- Reports: flags/day, most-flagged users/chats, resolution time, false-positive rate
- Reuse `src/nsfw/moderation-service.ts` flag/audit primitives where applicable

## Frontend

- Admin tab "Review" in `src/views/admin.html` + `src/frontend/alpine/admin-review.ts`
- Flagged-content table (type, preview ≤100 chars, chat, reported-by, reason, status, created)
- Review dialog with content context (prev/next message) + action buttons
- Flag button on messages/assets (desktop right-click, mobile long-press)

## Acceptance Criteria

- [ ] Flag dialog with reason presets + custom reason
- [ ] Review queue lists pending flags with filters
- [ ] Review actions functional (keep/delete/mute/dismiss/spoiler-tag)
- [ ] Auto-moderation rules configurable in admin system tab
- [ ] Moderation stats endpoint + minimal display
- [ ] Tests passing
- [ ] Documentation updated