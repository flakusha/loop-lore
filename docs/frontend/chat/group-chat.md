# Group Chat Spec (Draft)

> **Implementation status:** Group chat is **partially implemented**. The `chats.type`
> column, the `chat_participants` many-to-many table, and the new-chat UI (direct/group +
> multi-select) already exist, so a group chat can be _created_. However, the behaviors
> below — talkativity (multiple AI characters taking turns), multi-user participants, and
> story orchestration — are **not yet implemented**. Today the generation path replies as
> only the first non-user participant (`src/routes/messages.ts`), so a group of characters
> behaves like a 1:1 chat.

## Core Idea

Extend 1x1 chat to multiple participants (users/characters/assistants). Keep tree message model.

## Participants

- User (human)
- Character (AI)
- Assistant (optional)
- Additional Users (optional)

## Turn Order

- Each participant has a **talkativity** score that biases how often it speaks.
- Score derived from:
  - `talkativity` enum (low, medium, high)
  - user config weight
  - character personality preset
- Talkativity feeds the orchestration strategy. The implementation already defines a
  `turn_strategy` enum on `chats` (`round_robin`, `scene_based`, `initiative`,
  `quest_driven`, `hybrid`) — this draft's `FIXED/ROTATE/RANDOM` modes should be reconciled
  with that enum, with talkativity as an input to `scene_based`/`hybrid` selection.
- Configurable mode:
  - `FIXED` — order static by score
  - `ROTATE` — cycle through participants each message
  - `RANDOM` — random per message
- In a **story** chat the **Game Master** (an assistant role — see
  [assistant.md](./assistant.md)) selects the next actor rather than a fixed rotation.

## Initiative Features

- **Initiative flag**: participant may prepend message with `>>` to claim next turn early.
- **Auto‑initiative**: if talkativity > threshold, system may auto‑advance turn.
- **Initiative cost**: consumes 1 initiative point per claim; points regen each round.

## Message Tree

- Same as 1x1: each message has `parent_id`.
- Group chats allow **multiple children** per parent.
- **Group node**: a message can have `group_id` linking siblings as alternative branches.
- Visible timeline = in‑order traversal of tree.
- **Active path** = root → latest visible leaf.

## Data Model Changes

- Add column `type` in `chats` table: `'direct'` or `'group'`.
- Add column `initiatives_available` to `participants` view.
- New table `group_initiatives`:
  - `chat_id`
  - `participant_id`
  - `points_remaining`
- Extend `messages` schema:
  - `participant_type` (user|character|assistant|other)
  - `initiatives_used` (int, default 0)

## API Routes (draft)

- `GET /api/groups/:chatId` — fetch chat with participants and initiative state.
- `POST /api/groups/:chatId/messages` — post message, body:

  ```json
  {
    "content": "string",
    "initiatives_used": 0,
    "talkativity": "medium"
  }
  ```

- `PUT /api/groups/:chatId/initiative` — adjust initiative points.

## UI Sketch

- Left panel: participant list with current turn indicator.
- Center: chat window (message tree view).
- Right panel: initiative controls, talkativity sliders, preset selector.
- Swipe support for alternative branches.

## Future Extensions

- Per‑chat initiative cost scaling.
- AI‑driven initiative allocation (e.g., GM behavior).
- Group-wide freeze/unfreeze by admin.
- Auto‑archive inactive groups.

---

## Targeted Invocation (@mentions)

In a group chat, a participant may direct a message at a specific actor with an `@` mention
(e.g., `@Alice` or `@Gandalf`). The mentioned actor is prioritized as the next responder
instead of the normal turn-order selection, letting a user or character steer the
conversation to a particular participant without disrupting overall talkativity.

- `@user` → the named human participant is prompted to respond.
- `@character` → that character is selected as the next speaker (overrides turn strategy for
  this turn).
- `@assistant` → invokes the assistant on demand (any of its roles).

## Pause Mode & Side Chat

**Pause mode**: the chat master (or an Influencing GM) can pause branch development. While
paused, AI participants cannot generate new messages on the active branch — useful for
freezing the story while humans discuss direction.

**Side chat (notes / discussion)**: a separate, context-isolated channel attached to the
chat where participants can converse, leave notes, or debate. Side-chat messages are
**excluded from the prompt assembled for generation**, so they inform participants privately
without polluting the narrative/story branch. A side-chat note may optionally be "promoted"
into the main chat as a system or user message.

## Assistant Integration

A group chat may include the assistant as a participant in any of its roles
([assistant.md](./assistant.md)):

- **Pure Assistant** — invoked on demand, does not take turns.
- **Game Master** — owns turn selection and (if `influence` tier) writes messages, manages
  quest/world state. In story chats this replaces fixed rotation.
- **Moderator** — silently scans messages for prohibited content per site policy.

## Implementation Status / TODO

- [ ] Generation path selects multiple participants by `turn_strategy` + talkativity
      (replace single-`executeTakeFirst` pick in `src/routes/messages.ts`).
- [ ] Allow `actor_type = user` participants in the new-chat UI (currently filtered out).
- [ ] Persist per-participant talkativity / initiative state.
- [ ] Wire `ChatMode.Story` + `TurnManager` (`src/story/`) into generation.
- [ ] Add assistant as a per-chat participant/role (see assistant.md).
- [ ] `@` mention targeting for next-responder selection.
- [ ] Pause mode (freeze AI generation on the active branch).
- [ ] Side chat / notes channel excluded from generation context.

---

**Notes:**

- Keep logic symmetrical with 1x1 chat to reuse message tree code.
- Talkativity scores stored in `characters` table, fallback to default values.
- Initiative points per participant = `talkativityLevel * 2 + 1`.
