# TASK: `/...` slash commands for chat, group chat, assistant continuation

**Epic:** epic-frontend-chat-commands.md
**Status:** Open
**Priority:** High

## Scope

- Frontend command registry (`src/frontend/alpine/chat-actions/commands.ts`
  or equivalent): name, scope (chat/group/assistant), required role,
  arg schema, help text; `/` popup with filter + keyboard select + Esc.
- Assistant continuation: commands resume prior assistant run state
  (world/location/character/NPC flow context) instead of cold start;
  unknown command → toast with closest match.
- Group chat: mention-aware variants (`/roll`, `/poll`, moderation-gated
  ones defer to TASK-moderation-actions-frontend for enforcement).

## Acceptance

- `/help` lists only commands allowed in current scope+role.
- Assistant `/continue` after reload resumes, not restarts, the flow.
