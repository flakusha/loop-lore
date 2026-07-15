# Chat: Overview & Data Model

## Chat Types

A chat is either **1:1** (`type: direct`) or **multi-participant** (`type: group`).
Group support is structurally present (schema + UI) but talkativity, multi-user, and
story orchestration still require implementation — see [group-chat.md](./group-chat.md).
Participants are distinguished by actor type:

| Type             | Participants          | Assistant role                                                   | Primary use                                             |
| ---------------- | --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| User × Character | User + Character      | Optional: mediates roleplay mechanics                            | Standard roleplay, story-driven chat                    |
| User × User      | User + User           | Optional: game master, dice rolls, narration                     | Collaborative storytelling, co-writing                  |
| User × Assistant | User + Assistant only | Acts as agent: edits text, generates images, helps develop story | Story/world development, writing support, brainstorming |

**Assistant role**: the assistant is a **first-class, per-chat configurable entity** (not a
background-only agent). It can be absent, or take one of three roles — **Pure Assistant**,
**Game Master (GM)**, or **Moderator** — each with its own permissions. The GM in
particular may be created **with or without permission to influence the chat** (observer vs.
influencing). Full design in [assistant.md](./assistant.md). Note: only a global
rule-based responder exists today; the per-chat entity is not yet implemented.

**World + Location**: any chat type can optionally reference a World (first-class entity with lore, rules, atmosphere). A World can have many Locations, which can be connected to each other (e.g., "Forest → Cave → Dungeon"). A 1:1 chat optionally binds to a specific Location within a World.

- World: name, description, lore, rules.
- Location: sub-entity of World with name, description, and connections to other locations.
- Chat references a Location within a World.
- World has many Locations; a Location belongs to one World.
- A chat optionally binds to a specific Location. The same Location can be referenced by multiple chats. Locations can connect to each other (forming a graph: Forest → Cave → Dungeon).

**Group chat**: structurally supported (the `chats.type = group` column, the
`chat_participants` many-to-many table, and the new-chat UI all exist), but the behaviors
that make it useful are **not yet implemented**:

- **Talkativity** — multiple AI characters taking turns — requires the generation path to
  select more than one participant (today it replies as only the first non-user actor).
- **Multi-user** — the new-chat UI filters out `actor_type = user`, so multiple humans
  cannot currently be added as participants.
- **Story orchestration** — `ChatMode.Story` is selectable but the story API/turn-manager is
  unwired.

See [group-chat.md](./group-chat.md) and [assistant.md](./assistant.md).

---

### Generation Style Presets (Future)

A per-chat configuration that controls how the LLM generates responses. Not implemented in v1 — all chats use the default preset. Planned options:

| Preset   | Description                                                       | Use case                                       | Cost/speed             |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------- | ---------------------- |
| Short    | 1-2 paragraphs, minimal description, action-focused dialogue      | Fast-paced games, quick back-and-forth, combat | Cheaper, faster        |
| Default  | 1-5 paragraphs with descriptions, balanced narration and dialogue | Standard roleplay, most conversations          | Baseline               |
| Detailed | Long-form responses, rich descriptions, deep character immersion  | Literary RP, slow-burn storytelling            | More expensive, slower |

Each preset maps to a system prompt instruction appended to the chat context. The preset is selectable per chat (not per-character) so the same character can have short action chats and long literary chats.

**Future considerations**:

- Per-chat preset stored in the chat record
- Preset can be changed mid-chat (affects future generations only, not existing messages)
- Tied to the main model selector — if the user switches to a cheaper model, they may want shorter presets to control costs

---

## Data Model

Relationships:

- Character has many Chats
- User has many Chats
- Chat belongs to one Character and one User
- Chat optionally references one World
- Chat optionally references one Location (sub-entity of World)
- Chat has many Messages
- Message belongs to one Chat

A chat without a world is a freeform conversation with just the character's default persona. A chat linked to a world inherits that world's lore and setting context. A chat linked to a Location inherits the location-specific context.

---

## Message Tree Model

Messages form a **tree**, not a flat timeline. Each message has a `parent_id` referencing the message it responds to.

Example tree structure:

- Message A (root, no parent): User says "Tell me about the forest"
  - Message B (child of A): Character responds "The forest is dark..."
    - Message D (child of B): User asks "What lives there?"
      - Message E (child of D): Character responds "Wolves..."
    - [swipe] Message C (child of A, alternative to B): Character responds "Dark..."
  - [swipe] Message C2 (child of A, alternative to B): Character responds "The woods..."

- The first message in a chat has no parent (root).
- A user message gets a `parent_id` pointing to the last character/other-user/assistant message it responds to.
- A character/assistant message gets a `parent_id` pointing to the user message that triggered it.
- Swipe variants share the same `parent_id` — they are siblings, not children.
- The visible timeline is an **in-order traversal** of this tree (active leaf path).
- **Active path**: the chain of messages from root to the latest visible message, picking the active swipe variant at each fork.
- **Continuation messages** are children of partial/cancelled messages. A continued message appears immediately after its parent with "↳ continued from above" connector. Multiple continues form a chain (A → Continue B → Continue C).
- **System/user messages for narration**: additional messages can be injected into the chat to guide story development. These are not hidden from the user — they appear in the timeline as system-labelled messages.

Extended tree example with continuation:

- Message A (root): User says "Tell me about the forest"
  - Message B (child of A): Character responds "The forest is dark... [cancelled - 45 tokens]"
    - Message B1 (child of B) — ↳ continued from above: "and full of ancient secrets. The trees..."
      - Message B2 (child of B1) — ↳ continued from above: "whisper warnings to those who listen."
  - [swipe] Message C (child of A, alternative to B): Character responds "The woods..."

---

## Chat Master

The **chat master** is the user who created the chat.

| Who             | Permissions                                                                          |
| --------------- | ------------------------------------------------------------------------------------ |
| Chat master     | Delete any message, freeze/unfreeze panels, configure assistant, manage participants |
| Non-master user | Delete own messages only                                                             |
| Admin           | Overrides all — can delete any message in any chat, assume master role               |
| Solo mode       | Local user is always master                                                          |

In User × User chats, both users are co-masters.

**Assistant / GM relationship**: the chat master configures the assistant, including its GM
permission tier (see [assistant.md](./assistant.md)). An **Influencing GM** can perform
master-like actions (write messages, edit world/quest state, manage participants); an
**Observer GM** may only advise and cannot mutate the chat. An **Admin** overrides both the
master and any GM.

---

## World & Location Notes

- World is a first-class entity: name, description, lore, rules.
- Location is a sub-entity of World: name, description, connections to other locations.
- A chat references exactly one Location at a time. Location can change mid-chat (e.g., party moves from Forest to Cave).
- Location context injected into LLM prompt: "You are in {{location.name}}. {{location.description}}. Connected locations: {{location.connections}}."
