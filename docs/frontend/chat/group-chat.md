# Group Chat Spec (Draft)

> **Implementation status:** Group chat is **partially implemented** with core
> infrastructure in place. Schema (migration 009), turn orchestration (`src/turning/`),
> generation path wiring (`src/group-chat/`), and frontend UI (pause, @mention, settings)
> are built. Remaining work: DB persistence for mentions/initiatives, side-chat creation
> route, assistant-as-participant, and multi-user participant management.

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

### Done

- [x] Schema: `chat_participants.talkativity`, `chat_participants.initiative`,
      `chats.parent_chat_id`, `chats.chat_purpose`, `group_initiatives` table,
      `chat_mentions` table (migration 009).
- [x] TurnManager generalized to `src/turning/` — shared by story + group chat.
- [x] 5 turn strategies implemented: `round_robin`, `scene_based`, `initiative`,
      `quest_driven`, `hybrid`.
- [x] Generation path (`src/routes/messages.ts`) uses `selectNextGroupActor()` for
      group chats — replaces single-`executeTakeFirst` pick.
- [x] @mention override — `@CharacterName` in message selects that actor as next
      responder, bypassing turn strategy.
- [x] New-chat UI allows `actor_type = user` participants.
- [x] Chat settings modal: turn strategy dropdown + pause checkbox for group chats.
- [x] Pause toggle button in chat header — freezes AI generation.
- [x] @mention autocomplete in input area (Alpine.js dropdown).
- [x] Talkativity update endpoint: `PUT /api/chats/:id/participants/:actorId`.
- [x] PromptAssembler includes other participants' character cards in group context.
- [x] Talkativity weights input to turn strategies via `TurnParticipant.talkativity`.

### Not yet done — gaps from schema-ready tables

- [ ] **Persist @mentions to DB**: write `chat_mentions` records when user sends a
      message with `@ActorName`. Enables mention history tracking and analytics.
      Insert in `messages.ts` after message creation, before `triggerAutoGeneration()`.
- [ ] **Wire initiative strategy to `group_initiatives` table**: `initiativeSelect`
      currently uses `talkativity` weights only. Should read/write `group_initiatives`
      scores — initiative points persist across turns, resettable per scene.
- [ ] **Side-chat creation route**: `POST /api/chats/:id/side` — creates a child chat
      with `parent_chat_id` set, `chat_purpose` = 'side' or 'notes'. Participants
      inherit from parent. Side-chat messages excluded from parent generation context.

### Not yet done — new features

- [ ] **Assistant as per-chat participant**: add assistant actor to `chat_participants`
      with a role (`pure_assistant`, `game_master`, `moderator`). Assistant turns
      selected by role-specific logic, not talkativity.
- [ ] **Multi-user participant management UI**: dedicated panel to add/remove users,
      set roles (owner/member/observer), adjust talkativity sliders.
- [ ] **Side-chat UI**: sidebar listing side channels, button to create, switch between
      main/side/notes views.
- [ ] **Initiative cost for `>>` prefix**: user prepends `>>` to claim next turn early,
      costs 1 initiative point. Points regen each round.
- [ ] **`ChatMode.Story` for group chats**: wire full TurnManager scene tracking into
      non-story group chats (currently only story mode uses scene transitions).

---

## Next Implementation Steps — Detailed Requirements

### Location-Scoped Chat Visibility

Group chats can be bound to a location within a world. These chats inherit
a visibility setting independent of the location itself.

**Visibility states:**

- `public` — discoverable by any user who can see the location. Listed on
  the location detail page. Anyone can join.
- `private` — hidden from the location detail page. Only invited
  participants can see and access the chat.

**Schema:** `chats.visibility` column (already exists in schema, values
`'public'` | `'private'`, default `'public'`).

**Discovery:** the location detail page lists public group chats with name,
participant count, and last message preview. Private chats are not shown
unless the current user is a participant.

**Joining:** public chats have a "Join" button. Private chats require an
invite from the chat master or an existing participant.

**Independence:** a location can be fully visible (world browser shows it,
description readable) while all its chats are private. Visibility is
per-chat, not per-location.

---

### Step 1: Persist @mentions to DB

**Goal**: Record which actors were @mentioned in each message for history tracking.

**Where to change**:

- `src/routes/messages.ts` — after message creation (around line 680), before `triggerAutoGeneration()`

**Logic**:

```typescript
// After inserting the user message:
const mentionedActorIds = extractMentionedActorIds(userMessage);
for (const actorId of mentionedActorIds) {
  await db
    .insertInto("chat_mentions")
    .values({ id: crypto.randomUUID(), message_id: message.id, actor_id: actorId })
    .execute();
}
```

**No UI changes needed** — this is backend-only persistence.

---

### Step 2: Wire initiative strategy to `group_initiatives` table

**Goal**: Initiative points persist across turns; strategy reads/writes from DB.

**Where to change**:

- `src/turning/turn-strategies.ts` — `initiativeSelect()` function
- `src/turning/turn-manager.ts` — `recordTurn()` should update initiative scores

**Logic**:

- `initiativeSelect()` receives `db` and `chatId` in context → queries `group_initiatives` for current scene scores
- Weight calculation: `talkativity * 2 + initiative_points`
- After each turn, `recordTurn()` decrements the active actor's initiative by 1
- Scene transitions (detected by `sceneBasedSelect` or GM) reset all scores to default

**Schema already exists**: `group_initiatives(chat_id, scene_id, actor_id, score)`.

---

### Step 3: Side-chat creation route

**Goal**: Create child chats linked to a parent group chat.

**Where to change**:

- `src/routes/chats.ts` — add `POST /api/chats/:id/side` endpoint

**Request body**:

```json
{
  "name": "OOC Discussion",
  "purpose": "side", // or "notes"
  "participant_ids": ["optional-subset"] // omit = inherit all from parent
}
```

**Response**: returns new chat object with `parent_chat_id` set.

**UI changes**: add "Create Side Channel" button in `src/components/chat/chat-header.html`.

---

### Step 4: Assistant as per-chat participant

**Goal**: Allow assistant actor in group chat with role-based behavior.

**Where to change**:

- `src/group-chat/turn-selector.ts` — `selectNextGroupActor()` should handle assistant role
- `src/assistant/prompt-assembler.ts` — assistant participant gets different prompt structure

**Roles**:

- `pure_assistant` — invoked on demand only (via `@Assistant`), never auto-selected
- `game_master` — owns turn selection (replaces default strategy), can write narration
- `moderator` — scans messages silently, no visible turns

**Schema**: `chat_participants.role_in_chat` already supports `member | owner | observer`.
Add `assistant_role` column or use existing `role_in_chat` with assistant-specific values.

---

### Step 5: Multi-user participant management UI

**Goal**: Dedicated panel to manage group chat participants.

**Where to change**:

- `src/components/chat/` — new `participant-panel.html` partial
- `src/frontend/alpine/chat-management.ts` — participant CRUD methods

**Features**:

- List participants with avatar, name, role, talkativity slider
- Add participant (user/character/assistant) via search
- Remove participant
- Set role: owner / member / observer
- Adjust talkativity (1-10) with slider — calls `PUT /api/chats/:id/participants/:actorId`

---

### Step 6: Side-chat UI

**Goal**: Navigate between main chat and side channels.

**Where to change**:

- `src/components/chat/chat-header.html` — add side-chat indicator/dropdown
- `src/views/` — new `side-channels-list.htmx` partial

**Features**:

- Header shows current channel name (main / side / notes)
- Dropdown lists all side channels for current chat
- Click to switch (loads different chat ID into Alpine state)
- "New Side Channel" button opens creation form

---

## Reference: Key Files

| File                                           | Role                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| `src/turning/turn-manager.ts`                  | TurnManager class — orchestration engine          |
| `src/turning/turn-strategies.ts`               | 5 strategy functions + `STRATEGY_MAP`             |
| `src/group-chat/turn-selector.ts`              | `selectNextGroupActor()` — group chat entry point |
| `src/group-chat/mention-parser.ts`             | `parseMentions()`, `resolveMention()`             |
| `src/routes/messages.ts`                       | Message CRUD + `triggerAutoGeneration()`          |
| `src/assistant/prompt-assembler.ts`            | Prompt assembly with `groupParticipantIds`        |
| `src/routes/chats.ts`                          | Chat CRUD + participant endpoints                 |
| `src/frontend/alpine/chat-management.ts`       | Chat settings, pause, @mention UI state           |
| `src/frontend/alpine/types.ts`                 | ChatState type definitions                        |
| `src/components/chat/input-area.html`          | Input with @mention autocomplete                  |
| `src/components/chat/chat-header.html`         | Pause button                                      |
| `src/components/chat/chat-settings-modal.html` | Turn strategy + pause checkbox                    |
| `src/db/migrations/009_group_chat.ts`          | Schema additions                                  |
