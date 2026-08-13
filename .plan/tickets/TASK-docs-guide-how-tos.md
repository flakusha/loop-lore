# TASK: User guide how-tos

**Status:** 🟡 In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-docs-reconciliation.md

## Summary

Grow `docs/guide/` from 3 thin pages into practical, implementation-grounded
how-tos for the main user flows.

## Acceptance Criteria

- [x] `docs/guide/first-chat.md` — install → create character → first chat → send
- [x] `docs/guide/personas.md` — create/edit/use personas, impersonation
- [x] `docs/guide/worlds.md` — create world, locations, linked chats/assets
- [x] `docs/guide/gallery.md` — upload, search, link to chats/worlds/locations
- [x] `docs/guide/settings.md` — all tabs (general/chat/api/notifications/data/keys)
- [x] `docs/guide/getting-started.md` rewritten to route users to first-chat
- [x] New pages wired into vitepress guide sidebar

## Notes

Content grounded against actual views (`src/views/*.html`,
`src/components/chat/*.html`) and the settings/gallery/personas Alpine state —
not aspirational spec text. Left the existing `characters.md` as-is (already a
solid how-to).