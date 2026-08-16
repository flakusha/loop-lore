<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Chat Template Config Lifecycle — Bound Migration Over Live Mutation

**Status**: open
**Priority**: medium
**Labels**: chat, templates, config, lifecycle, migration, architecture
**Assignee**:
**Epic**: epic-story-mode-ui
**Related**: IDEA-chat-setup-templates, .plan/epics/epic-config-templates.md,
.plan/epics/epic-chat-lifecycle-moderation.md, BUG-chat-settings-modal-invalid-mode,
FEAT-message-swipe-replay-branch, .plan/epics/epic-config-templates.md
(distinct domain: chat _setup_ template binding vs LLM _prompt text_ registry — do not conflate)

## Description

Enforce the online-chat configuration policy: templates are **bound at creation** and key
mechanics are **immutable once the chat is online**. Changing key mechanics requires
**migrating to a new chat** (`POST /api/chats/:id/migrate`) rather than live mutation.

Today `PATCH /api/chats/:id` → `updateChat` (`src/chat/service.ts:179`) mutates `mode`,
`turnStrategy`, `worldId`, `gmConfig`, `visualNovel` live with no guard except the admin
panel-freeze. This lets foundational mechanics be swapped under a live conversation.

## Design

See `.plan/epics/epic-config-templates.md` for the full design. Summary:

- **Key mechanics** (immutable once online): `mode`, `turnStrategy`, `gmConfig.assistantRole`,
  `visualNovel`, `worldId`, `responseStyle`, `type`.
- **Session state** (mutable online): `name`, `isPinned`, `isPaused`, `freezePanel` (admin),
  `currentLocationId`, participants.
- **Online** = at least one confirmed message
  (`EXISTS(SELECT 1 FROM messages WHERE chat_id = ? AND status = 'confirmed')`).
- **Migration** = new chat from a template, reusing `chats.parent_chat_id`, carrying
  participants/memory/history, archiving the source.

## Acceptance Criteria

- [ ] `chat_setup_templates` table (or config presets) + `chats.template_id` FK (snapshot binding)
- [ ] `GET /api/chat-setup-templates` lists templates; `POST /api/chats` accepts `templateId`
- [ ] `new-chat.html` template selector pre-fills hidden (`turnStrategy`, `worldId`,
      `gmConfig`, `visualNovel`) + visible fields
- [ ] `updateChat` rejects key-mechanic mutation once online (409 + migration pointer);
      session-state fields still pass through
- [ ] Settings modal hides key-mechanic fields when the chat is online
- [ ] `POST /api/chats/:id/migrate` — new chat from template, carry participants/memory/
      history (`none|summary|full`), archive source, return `{ newChatId, sourceChatId }`
- [x] Party-transfer carry on migration: `carry.state` (story_turns, quest_progress,
      group_initiatives), `carry.pins` (chat_pins, vn_choices), `carry.worldState`
      (world/npc/location state, copied only when migrating to a different world)
- [ ] Migration idempotency guard (no duplicate migrations from same source)
- [ ] Template edits do not retroactively change bound chats (snapshot semantics)
- [ ] Tests: online guard, migration carry, snapshot binding, idempotency

## Files

- `src/db/migrations/0XX_chat_setup_templates.ts` — table + `chats.template_id`
- `src/validation/schemas.ts` — `ChatSetupTemplateSchema`, `ChatMigrateBody`; strip key
  mechanics from `ChatUpdateBody` for online chats
- `src/chat/service.ts` — `isChatOnline`, online guard in `updateChat`, `migrateChat`
- `src/routes/chats.ts` — `GET /api/chat-setup-templates`, `POST /api/chats/:id/migrate`
- `src/views/new-chat.html` + `src/frontend/alpine/new-chat.ts` — template selector
- `src/components/chat/chat-settings-modal.html` — hide key-mechanic fields when online
- `docs/frontend/chat/templates.md` — user-facing doc (created)

## Notes

- Depends on the 3-axis mode split (`chat-mode-reconciliation.md`) and a valid mode enum
  (`BUG-chat-settings-modal-invalid-mode.md`) so templates select a real behavioral mode.
- `gmConfig` human/hybrid GM shape gap (`epic-assistant-gm-flows.md`) should be resolved in
  lockstep.
- Battle/VN are **mode overlays**: transient enter/exit may be a session-state toggle, but the
  bound `mode`/`turnStrategy` remain immutable. Define per-overlay mutability explicitly.
