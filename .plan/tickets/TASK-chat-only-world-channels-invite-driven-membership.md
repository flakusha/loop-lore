# TASK: Chat-only world channels (invite-driven membership)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

For non-RPG chat-only worlds, locations act as channels (1 location : N chats) grouping chat streams. Add: worlds.kind ('rpg'/'chat'), worlds.visibility ('public'/'unlisted'/'private'), world_members (flat, no roles), world-scoped invites (generalize chat_invites), widen requireWorldAccess (owner|admin|member|public+auth), GET /api/worlds/:id/chats grouped enumeration + sidebar tree. SFW/NSFW gate via existing canAccessNsfw.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
