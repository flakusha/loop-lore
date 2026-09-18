<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Chat Template Config Lifecycle — Bound Migration Over Live Mutation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status**: verified-shipped
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

- [x] `chat_setup_templates` table (or config presets) + `chats.template_id` FK (snapshot binding)
      → migration `006_chat.ts`; `chat_setup_templates` + `chats.template_id` FK present
- [x] `GET /api/chat-setup-templates` lists templates; `POST /api/chats` accepts `templateId`
      → `src/routes/chats/templates.ts` GET/POST/PUT/DELETE; tests `src/routes/chats.test.ts:449`
- [x] `new-chat.html` template selector pre-fills hidden (`turnStrategy`, `worldId`,
      `gmConfig`, `visualNovel`) + visible fields
      → `src/frontend/pages/new-chat/submit.ts:73,91,102` reads `#chat-template` + applies `fineTunePayload`
- [x] `updateChat` rejects key-mechanic mutation once online (409 + migration pointer);
      session-state fields still pass through
      → `src/chat/service/crud/update.ts:84` `key_mechanic_conflict` with `migrateEndpoint: /api/chats/:id/migrate`;
      `update.test.ts` covers top-level + `gmConfig.llmConfig` + mixed-blob + presentation-allowed
- [x] Settings modal hides key-mechanic fields when the chat is online
      → `src/components/chat/chat-settings-modal.html` `x-show="!_chatOnline"` on every
      key-mechanic form group; `src/frontend/alpine/chat-settings.ts:25,77,189` drives `_chatOnline`
- [x] `POST /api/chats/:id/migrate` — new chat from template, carry participants/memory/
      history (`none|summary|full`), archive source, return `{ newChatId, sourceChatId }`
      → `src/routes/chats/manage.ts:41`; tests in `src/routes/chats.test.ts:598+637+666+687+797+1003`
- [x] Party-transfer carry on migration: `carry.state` (story_turns, quest_progress,
      group_initiatives), `carry.pins` (chat_pins, vn_choices), `carry.worldState`
      (world/npc/location state, copied only when migrating to a different world)
      → `src/chat/service/transitions.ts:136-153`
- [x] Migration idempotency guard (no duplicate migrations from same source)
      → `src/chat/service/transitions.ts:58-69` scoped to migrated children (`template_id IS NOT NULL`);
      `src/routes/chats.test.ts:637` "is idempotent (rejects second migrate)"
- [x] Template edits do not retroactively change bound chats (snapshot semantics)
      → chat rows value-copy mode/turn_strategy/gm_config at create time (`src/chat/service/crud/create.ts:23-43`);
      template edits only mutate the template row; explicit regression:
      `src/chat/setup-templates.test.ts` "template edits do not retroactively change bound chats"
- [x] Tests: online guard, migration carry, snapshot binding, idempotency
      → 649 pass across `src/chat/` + `src/routes/chats.test.ts` + `src/routes/chats/`
      (snapshot binding test added in this batch).

## Resolution (verified 2026-09-18)

All acceptance criteria are implemented and covered by tests. The full feature
ships in the chat-lifecycle merge (`cd833142` + follow-ups). Ponytail audit:
the one missing explicit regression was the snapshot-binding test (template
edits not retroactively changing bound chats); added it and ran the suite —
9/9 pass. Closing as `verified-shipped`.

Outstanding follow-ups (separate tickets, not in this scope):
- `docs/frontend/chat/templates.md` (user-facing doc) — `docs/frontend/` exists
  but no per-template user doc; tracked outside this ticket.

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
