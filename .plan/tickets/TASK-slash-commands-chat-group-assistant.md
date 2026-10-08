<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: `/...` slash commands for chat, group chat, assistant continuation

**Effort:** Medium
**Summary:** Ship the unified `/...` registry surface: scope/role metadata per command, assistant continuation commands (`/continue`, `/branch`, `/retry`), and group-chat mention-aware variants (`/roll` exists, `/poll` new). Done already: server-backed palette, `/help` role-filtering, did-you-mean, Tab-accept, pre-send preview (see epic Status Note).
**Context:** Live registry is `src/assistant/commands/registry.ts` (`requiredRole`, `available`); `GET /api/v1/commands` exposes names only with no per-chat scope, so the palette cannot role-filter yet. Unknown `/foo` falls through to LLM chat by design (`command.test.ts` pins `handled:false`); did-you-mean lives in the palette (`didYouMeanCandidate`), not the send path.
**Acceptance Criteria:** `/help` lists only scope+role-allowed commands; `/continue` after reload resumes the flow; `/poll` registered with moderation gating; palette filters by role once the commands endpoint accepts an optional `chatId`.


**Epic:** epic-frontend-chat-commands
**Status:** Not Started
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
