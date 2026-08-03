# Chat Template & Config Lifecycle — Research & Design

**Status:** Design (research complete)
**Created:** 2026-08-02
**Scope:** Chat setup templates (selectable at creation) + online-chat configuration policy
**Preference (owner):** **Bound-chat migration to a new chat** over live mutation of key mechanics.

---

## 1. Problem

Two gaps in the current chat config surface:

1. **Creation-time**: `POST /api/chats` accepts a rich `ChatCreateBody` (`src/validation/schemas.ts:157`),
   but `new-chat.html` only sends `name`, `type`, `mode`, `participantIds`, `personaId`,
   `impersonateActorId`, `memoryCarry`. `turnStrategy`, `worldId`, `currentLocationId`,
   `gmConfig`, `visualNovel` are API-only — unreachable from the creation form.
2. **Online-time**: `PATCH /api/chats/:id` → `updateChat` (`src/chat/service.ts:179`) mutates
   `mode`, `turnStrategy`, `worldId`, `gmConfig`, `visualNovel` **live**, with no guard except
   the admin panel-freeze. A chat with a live conversation can have its foundational mechanics
   swapped underneath it, corrupting narrative/mechanical continuity.

This design resolves both with one model: **templates are bound at creation; key mechanics are
immutable once the chat is online; changing key mechanics requires migrating to a new chat.**

---

## 2. Current State (verified)

| Concern                         | Location                                                                  | Behavior                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Create body                     | `src/validation/schemas.ts:157` `ChatCreateBody`                          | Rich: type, mode, turnStrategy, worldId, currentLocationId, gmConfig, visualNovel         |
| Create handler                  | `src/routes/chats.ts` `.post("/api/chats")`                               | Passes subset through to `createChat`                                                     |
| Update body                     | `src/validation/schemas.ts:171` `ChatUpdateBody`                          | name, mode, turnStrategy, worldId, isPinned, isPaused, freezePanel, gmConfig, visualNovel |
| Update service                  | `src/chat/service.ts:179` `updateChat`                                    | Writes mode/turnStrategy/worldId/gmConfig/visualNovel unconditionally                     |
| Only online guard               | `src/chat/service.ts:191` panel-freeze (admin)                            | Blocks all settings when `isPanelFrozen`, non-admin                                       |
| ChatType/ChatMode/ResponseStyle | `.plan/design/chat-mode-reconciliation.md`                                | 3-axis split; `mode` currently overloaded (`direct`/`group`/`story`)                      |
| Creation presets idea           | `.plan/tickets/IDEA-chat-setup-templates.md`                              | `ChatSetupTemplate` = validated `ChatCreateBody` preset                                   |
| Existing migration/fork hook    | `chats.parent_chat_id` (`src/db/migrations/parts/004_chats_actors.ts:19`) | Side-chat / fork linkage; SET NULL on delete                                              |
| Location change (sanctioned)    | `PUT /api/chats/:id/location`                                             | Dedicated runtime op; also `transfer` endpoint exists                                     |

---

## 3. Design

### 3.1 Two categories of chat config

Split every chat-config field into **key mechanics** (foundational, immutable once online) vs
**session state** (runtime, mutable online).

**Key mechanics (immutable once online):**

- `mode` (behavioral: story / battle / question / inventory — post-reconciliation)
- `turnStrategy` (round_robin / scene_based / initiative / quest_driven / hybrid)
- `gmConfig.assistantRole` (off / helper / gm / moderator) + `visualNovel`
- `worldId` (world binding)
- `responseStyle` (+ `response_style_custom`) — post-reconciliation
- `type` (direct/group) — already set at creation

**Session state (mutable online):**

- `name`, `isPinned`, `isPaused`, `freezePanel` (admin)
- `currentLocationId` — runtime travel, already dedicated endpoint
- participant add/remove (separate concern)

Rationale: key mechanics change _how the story/mechanics are generated and orchestrated_.
Changing them mid-conversation breaks continuity, invalidates in-flight turns, and desyncs
memory/world state. Session state affects only presentation/UX and is safe to flip live.

### 3.2 "Online" definition

A chat is **online** once it has at least one confirmed message (or an active story turn).
Before that it is a **draft** and key mechanics remain editable. This is a cheap, unambiguous
check: `EXISTS(SELECT 1 FROM messages WHERE chat_id = ? AND status = 'confirmed')`.

### 3.3 Templates bound at creation

Per `IDEA-chat-setup-templates.md`:

- `chat_setup_templates` table (or config-declared presets) keyed by slug; each row a validated
  `ChatCreateBody`-shaped preset with sane limits.
- `GET /api/chat-setup-templates` to list; `POST /api/chats` accepts optional `templateId` that
  seeds the create body (explicit user fields override).
- `new-chat.html` template `<select>` pre-fills hidden + visible fields.
- Record the bound template on the chat: add `chats.template_id` (nullable, FK to
  `chat_setup_templates`). This is the **binding** — the template that established the chat's
  key mechanics.

### 3.4 Online enforcement (bound, immutable)

`updateChat` gains a guard: if the chat is online **and** the request attempts to mutate any
**key-mechanic** field, reject with a 409 + a structured error pointing the user to the
migration endpoint (below). Session-state fields still pass through.

Mechanic fields are stripped from `ChatUpdateBody` for online chats (or rejected per-field) so
the UI settings modal never offers them as editable once online.

### 3.5 Migration to a new chat (the owner's preferred path)

To change key mechanics, the user **migrates**: create a **new chat** bound to a different
template, carrying over continuity. This reuses the existing `parent_chat_id` fork hook.

New endpoint: `POST /api/chats/:id/migrate`

```jsonc
{
  "templateId": "advanced-roleplay",
  "carry": {
    "participants": true, // copy chat_participants
    "memory": true, // copy actor_memories / memory carry
    "history": "summary", // "none" | "summary" | "full"
    "state": true, // copy story_turns, quest_progress, group_initiatives (party/game state)
    "pins": true, // copy chat_pins, vn_choices
    "worldState": true // copy world/npc/location state (only when migrating to a different world)
  },
  "name": "optional new name"
}
```

Behavior:

1. Validate target template + ownership.
2. Create new chat with `parent_chat_id = sourceChatId`, seeded from the template's
   `ChatCreateBody` (key mechanics come from the **new** template).
3. Optionally copy participants, memory, a summary/full history, and party/game state.
4. Archive the source chat (or leave it as a read-only branch).
5. Return `{ newChatId, sourceChatId }`; UI swaps to the new chat with a "migrated from" banner.

**Party-transfer carry (implemented):** `carry.state` re-points the chat-scoped party/game
state (`story_turns`, `quest_progress`, `group_initiatives`) to the migrated chat. `carry.pins`
carries `chat_pins` + `vn_choices`. `carry.worldState` copies world-scoped snapshots
(`world_states`, `npc_states`, `location_states`) only when the new template binds a
**different world** (same-world migrations already share them).

This keeps the source chat intact (history preserved), gives a clean continuity boundary, and
satisfies the preference: **you cannot change key mechanics in place — you fork to a new chat.**

### 3.6 Relationship to mode reconciliation & overlays

- Templates select `mode`; the 3-axis split (`chat-mode-reconciliation.md`) must land first so
  templates pick a real behavioral mode, not the overloaded `direct|group|story`.
- Battle (`TASK-chat-battle-mode-switch.md`) and VN-start are **mode overlays**. Per the
  reconciliation doc, toggling a transient overlay (enter/exit battle) is generation-only and
  safe to switch online **if** it does not change key mechanics. Recommendation: treat battle
  enter/exit as a **session-state overlay toggle** (mutable online), but the _chat's_ bound
  `mode`/`turnStrategy` remain immutable. Define each overlay's mutability explicitly to avoid
  ambiguity.
- `gmConfig` human/hybrid GM is unreachable from UI today (shape gap in
  `epic-assistant-gm-flows.md`); templates should wait on or drive that reconciliation.

---

## 4. Open Questions

1. **History carry fidelity** — "summary" vs "full" history on migration: does full carry
   preserve message tree + swipes, or only the active leaf path? Recommend active-leaf + memory.
2. **Source chat disposition** — archive vs keep-active-branch? Recommend archive (read-only)
   to avoid two live chats competing for the same narrative.
3. **Overlay mutability** — which overlays (battle, VN) are session-mutable vs bound mechanics?
   Needs a per-overlay policy table.
4. **Template versioning** — if a template is edited, do existing bound chats pick up changes?
   Recommend **no** (binding is a snapshot); only new chats see the new version.
5. **Migration idempotency** — guard against duplicate migrations from the same source.

---

## 5. Files to Touch (implementation phase, later)

- `src/db/migrations/0XX_chat_setup_templates.ts` — `chat_setup_templates` table + `chats.template_id`
- `src/validation/schemas.ts` — `ChatSetupTemplateSchema`, `ChatMigrateBody`, strip mechanics from `ChatUpdateBody`
- `src/chat/service.ts` — `updateChat` online guard; `migrateChat`; `isChatOnline`
- `src/routes/chats.ts` — `GET /api/chat-setup-templates`, `POST /api/chats/:id/migrate`
- `src/views/new-chat.html` + `src/frontend/alpine/new-chat.ts` — template selector
- `src/components/chat/chat-settings-modal.html` — hide key-mechanic fields when online
- `docs/frontend/chat/templates.md` — user-facing doc (see deliverables)

---

## 6. Deliverables

- This design doc (`.plan/design/chat-template-config-lifecycle.md`)
- `.plan/tickets/IDEA-chat-setup-templates.md` — updated with online-config policy + migration
- `.plan/tickets/FEAT-chat-template-config-lifecycle.md` — implementation ticket (new)
- `docs/frontend/chat/templates.md` — user-facing feature doc (new)
- `.plan/tickets/FEAT-message-swipe-replay-branch.md` — swipe/regenerate/replay mechanic (new) — session-state op, always allowed online (interlinked)
