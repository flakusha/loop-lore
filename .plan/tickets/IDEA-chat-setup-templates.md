# IDEA: Chat Setup Templates (Validated ChatCreateBody Presets)

**Status**: open
**Priority**: medium
**Labels**: chat, templates, chat-setup, architecture
**Assignee**:
**Epic**: epic-story-mode-ui
**Related**: BUG-chat-settings-modal-invalid-mode, .plan/design/chat-mode-reconciliation.md,
.plan/design/chat-template-config-lifecycle.md, FEAT-chat-template-config-lifecycle

## Description

Turn chat creation presets into data, not code. The backend already accepts a rich set of
fields on `POST /api/chats` (`ChatCreateBody` in `src/validation/schemas.ts:157`):

- `type` (`direct|group`), `mode` (`direct|group|story`), `turnStrategy`
  (`round_robin|scene_based|initiative|quest_driven|hybrid`)
- `participantIds`, `worldId`, `currentLocationId`
- `gmConfig` (`assistantRole: off|helper|gm|moderator`, `visualNovel`), `visualNovel`

**The new-chat UI (`src/views/new-chat.html`) only sends a subset**: `name`, `type`, `mode`,
`participantIds`, `personaId`, `impersonateActorId`, `memoryCarry` (+`memoryCarryIds`).
`turnStrategy`, `worldId`, `currentLocationId`, `gmConfig`, and `visualNovel` are API-only
today — not reachable from the creation form.

## Proposal

Add a **ChatSetupTemplate** = a validated `ChatCreateBody` preset, selectable on
`new-chat.html`:

1. Backend: a `chat_setup_templates` table (or config-declared presets) keyed by slug; each
   row is a `ChatCreateBody`-shaped JSON preset with sane defaults.
2. `GET /api/chat-setup-templates` to list; `POST /api/chats` accepts an optional
   `templateId` that seeds the create body (user-provided fields override).
3. `new-chat.html`: a template `<select>` that pre-fills the hidden create fields
   (`turnStrategy`, `worldId`, `gmConfig`, `visualNovel`) and the visible ones (type/mode,
   impersonation, memory-carry).
4. UI + i18n for template names/descriptions; expose API-only fields in the form.

## Motivation (sane starter set)

Cover the matrix discussed in review: simple 1×1 (+LLM), advanced 1×1, roleplay 1×1
(world-bound vs detached, memory exposed vs not), assistant chat (creative/support/expansion/
tool-calling/RAG/analysis), simple group (human/impersonation), group+assistant (brainstorm),
group+GM (LLM/human/hybrid), group multi-LLM (@-mentions/talkativity), RP group (world+events),
custom config with sane limits (max participants, max concurrent LLMs, max messages-per-turn
cascade, max memory-carry tokens).

## Relationship to existing work

- The 3-axis split (`ChatType` / `ChatMode` incl. `battle|question|inventory` /
  `ResponseStyle`) in `.plan/design/chat-mode-reconciliation.md` should be applied first or
  in lockstep — templates select `mode` which is currently overloaded.
- `gmConfig` human/hybrid GM is unreachable from UI today (shape gap documented in
  `epic-assistant-gm-flows.md`) — templates should wait on or drive that reconciliation.
- Battle (`TASK-chat-battle-mode-switch.md`) and VN-start (`TASK-chat-visual-novel-mode.md`)
  are mode overlays; templates can express "start already in VN/battle" once those exist.
- **Online-config policy** (see `.plan/design/chat-template-config-lifecycle.md`): templates
  are **bound at creation**. Once a chat is online (has a confirmed message), its key
  mechanics (`mode`, `turnStrategy`, `gmConfig.assistantRole`, `visualNovel`, `worldId`,
  `responseStyle`) are **immutable**. Changing them requires **migrating to a new chat**
  (`POST /api/chats/:id/migrate`, reusing `chats.parent_chat_id`), not live mutation.
  See `FEAT-chat-template-config-lifecycle` for the implementation ticket.

## Acceptance Criteria

- [ ] Backend `chat_setup_templates` presets (or config presets) with validation
- [ ] `GET /api/chat-setup-templates` + `POST /api/chats` accepts `templateId`
- [ ] `new-chat.html` template selector pre-fills hidden+visible create fields
- [ ] `turnStrategy`/`worldId`/`gmConfig`/`visualNovel` reachable from the creation UI
- [ ] Sane-limit defaults per template (participants, LLM concurrency, cascade size, memory tokens)
- [ ] Chat records its bound `template_id`; template edits do not retroactively change bound chats (snapshot)
- [ ] `updateChat` rejects key-mechanic mutation once the chat is online (409 + migration pointer)
- [ ] `POST /api/chats/:id/migrate` creates a new chat from a template, carrying participants/memory/history, archiving the source

## Notes

- BUG ticket `BUG-chat-settings-modal-invalid-mode.md` fixes the mode enum first; templates
  depend on a valid mode model.
- Generation queue/rate-limit/pool (global + per-chat) is a related greenfield gap (see
  frontend review); the "custom config with sane limits" template row needs it.
