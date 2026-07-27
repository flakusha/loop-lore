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
- Talkativity feeds the orchestration strategy (`chats.turn_strategy` enum — see `src/db/enums.ts`).
- Configurable mode:
  - `round_robin` — fixed cycle through participants (ignores talkativity)
  - `scene_based` — narrator every 3rd turn, otherwise round-robin
  - `initiative` — weighted random by talkativity + initiative score
  - `quest_driven` — prioritize actors relevant to active quest (MVP: delegates to round-robin)
  - `hybrid` — group: talkativity-weighted random with context boost; story: scene-based with quest triggers
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

  typescript
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
```
