# Chat Templates & Configuration Lifecycle

**Status:** Design (research complete)
**Owner:** chat setup templates
**Related:** `.plan/epics/epic-config-templates.md`, `.plan/tickets/IDEA-chat-setup-templates.md`

## Overview

Chat templates let you start a chat from a validated preset — a bundle of the fields the
backend already accepts on `POST /api/chats` (`turnStrategy`, `worldId`, `gmConfig`,
`visualNovel`, plus visible fields like type/mode/participants). Templates make the rich
API-only create surface reachable from the "New Chat" form, and give sane-limit defaults for
participants, LLM concurrency, cascade size, and memory carry.

Templates also define the **configuration lifecycle**: the mechanics a template binds are
**fixed at creation**. Once a chat is online (has messages), its key mechanics cannot be
changed in place. To change them, you **migrate to a new chat** bound to a different template.

## Two Kinds of Chat Configuration

| Kind              | Fields                                                                          | Changeable online?             |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| **Key mechanics** | mode, turnStrategy, gmConfig.assistantRole, visualNovel, worldId, responseStyle | **No** — migrate to a new chat |
| **Session state** | name, isPinned, isPaused, freezePanel (admin), currentLocationId, participants  | **Yes** — safe to flip live    |

Changing key mechanics mid-conversation would break narrative/generation continuity and
desync world/memory state. Session state only affects presentation and is safe to toggle.

## Creating a Chat From a Template

1. Open **New Chat**. A template `<select>` appears above the form fields.
2. Pick a template (e.g. _Advanced 1:1 Roleplay_, _Group + GM_, _Brainstorm Assistant_).
   It pre-fills the hidden create fields (`turnStrategy`, `worldId`, `gmConfig`,
   `visualNovel`) and the visible ones (type/mode, impersonation, memory-carry).
3. Override any field — your explicit choices win over the template defaults.
4. Create the chat. The chosen template is recorded as the chat's **binding**.

## The Configuration Lifecycle

```
Draft (no messages)          Online (has messages)
─────────────────────        ─────────────────────────
Key mechanics editable  →    Key mechanics LOCKED
Session state editable       Session state editable
                             Changing mechanics → MIGRATE to new chat
```

- **Draft**: before the first confirmed message, all fields are editable.
- **Online**: key mechanics are immutable. The settings modal hides them.
- **Migration**: to change key mechanics, use **Migrate to New Chat**.

## Migrating to a New Chat

**Migrate to New Chat** creates a fresh chat bound to a different template, carrying over
continuity. The source chat stays intact (archived, read-only).

```
POST /api/chats/:id/migrate
{
  "templateId": "advanced-roleplay",
  "carry": {
    "participants": true,
    "memory": true,
    "history": "summary"     // none | summary | full
  },
  "name": "optional"
}
```

What carries:

- **Participants** — the chat's members are copied to the new chat.
- **Memory** — actor memories / memory carry are preserved.
- **History** — either a summary of the conversation, the full message tree, or nothing.

After migration the UI swaps to the new chat with a "migrated from" banner. The source chat
is archived and read-only, so one narrative isn't being driven by two live chats.

## Template Versioning

Templates are **snapshots**. Editing a template does not change chats already bound to it —
only new chats created from the edited template see the changes. This keeps each chat's
mechanics stable for its lifetime.

## Sane-Limit Defaults

Each template carries limits so a preset never creates an unmanageable chat:

- Max participants
- Max concurrent LLMs
- Max messages-per-turn cascade
- Max memory-carry tokens

## See Also

- `.plan/epics/epic-config-templates.md` — full research & design (merged from `design/`)
- `.plan/tickets/IDEA-chat-setup-templates.md` — creation-preset ticket
- `.plan/epics/epic-chat-lifecycle-moderation.md` — 3-axis split (ChatType/ChatMode/ResponseStyle, merged from `design/`)
- `docs/frontend/chat/assistant.md` — GM/assistant roles (`gmConfig`)
