# TASK: Invite/block/mute/ban/kick actions (frontend)

**Epic:** epic-world-chat-channels-invites.md
**See also:** epic-chat-lifecycle-moderation.md, epic-group-chat.md
**Status:** Open
**Priority:** High

## Scope

- Member action menu in chat + group chat: invite, block, mute, ban,
  kick; each with confirm dialog stating scope + duration where
  applicable; role-gated (owner/mod/admin), disallowed actions hidden
  with reason tooltip.
- Optimistic membership list update with rollback; moderation events
  surface as system messages; block also hides content client-side.

## Acceptance

- Each action confirms, executes, updates member list without reload.
- Unauthorized user never sees an executable button for the action.
