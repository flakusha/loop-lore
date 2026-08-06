# TASK: Chat-only world channels (invite-driven membership)

**Status:** ✅ Complete (merged to dev: backend `95680e00`, frontend `d61ce737`)
**Priority:** Medium
**Effort:** Medium

## Summary

For non-RPG chat-only worlds, locations act as channels (1 location : N chats) grouping chat streams. Add: worlds.kind ('rpg'/'chat'), worlds.visibility ('public'/'unlisted'/'private'), world_members (flat, no roles), world-scoped invites (generalize chat_invites), widen requireWorldAccess (owner|admin|member|public+auth), GET /api/worlds/:id/chats grouped enumeration + sidebar tree. SFW/NSFW gate via existing canAccessNsfw.

## Implementation Status

- ✅ Migration `033_chat_invites.ts`: `worlds.kind` / `worlds.visibility` columns, `world_members` (PK world_id+actor_id), `world_invites` (code UNIQUE)
- ✅ Service `src/chat/world-invites.ts`: create/list/revoke/redeem; redeem inserts flat `world_members` idempotently
- ✅ Routes: `/api/worlds/:id/invites` CRUD, `/api/world-invites/:code/join`, grouped `GET /api/worlds/:id/chats`; `requireWorldAccess` widened (owner|admin|member|public+auth)
- ✅ Frontend: world-edit Invites tab (create/copy/revoke), chat sidebar join-by-invite-code, world channel tree grouped by location, kind/visibility selects, 14 i18n keys in 10 locales
- ✅ Backend service tests (13) + route tests pass; frontend `world-channels.test.ts` (9) pass
- ✅ Full suite: 3370 pass / 0 fail at merge time

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing (backend 13 + route tests; frontend 9 world-channel tests)
- [x] Documentation updated (this task file)

## Notes / Follow-ups (not in scope)

- i18n invite/kind/visibility keys are currently English in all 10 locales (full translation deferred)
- No world member-removal UI yet (flat `world_members` exists; removal is backend-only)
