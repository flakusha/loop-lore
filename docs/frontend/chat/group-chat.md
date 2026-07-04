# Group Chat Spec (Draft)

## Core Idea

Extend 1x1 chat to multiple participants (users/characters/assistants). Keep tree message model.

## Participants

- User (human)
- Character (AI)
- Assistant (optional)
- Additional Users (optional)

## Turn Order

- Each participant has **talkativity** score.
- Score derived from:
  - `talkativity` enum (low, medium, high)
  - user config weight
  - character personality preset
- Turn order = sort by score desc (high talkativity first) **or** rotate per round for fairness.
- Configurable mode:
  - `FIXED` — order static by score
  - `ROTATE` — cycle through participants each message
  - `RANDOM` — random per message

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

_Notes_:

- Keep logic symmetrical with 1x1 chat to reuse message tree code.
- Talkativity scores stored in `characters` table, fallback to default values.
- Initiative points per participant = `talkativityLevel * 2 + 1`.
