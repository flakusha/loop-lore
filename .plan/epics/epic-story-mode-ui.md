<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Story Mode UI

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** GM panel, GM guidance commands, quest panel and the story-state read models are wired; world/NPC state editing, turn-order display and the story-state SSE subscription contract are still open
**Priority:** P1 — High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** story, gm, quest, ui, frontend

## Goals

- Let the user act as Game Master over a story session — target characters, set the scene, constrain tone and control turn order from chat.
- Surface quest, world and turn state in the chat UI without a page reload.
- Reuse the story/quest/world backend routes rather than reimplementing state in the client.

## Scope

- GM panel (notes, entities) and the GM guidance slash commands in chat.
- Quest panel rendering backed by `src/routes/quests/`.
- Read-only story-state read models (`src/frontend/alpine/story-state/`).
- World/NPC state editing and turn-order display once their tickets land.

## Out of Scope

- Backend story, quest and world systems — owned by their own epics; this epic consumes their routes.
- The story-state SSE subscription contract — a clarification ticket, not UI work.
- Terminal UI parity; the TUI is a separate epic.

## Summary

Complete story mode interface including GM control panel, quest log, world state display, turn order visualization, and GM-guided story creation. Required to make the story system usable. GM-guided story creation lets the user act as Game Master, directly guiding LLM characters in chat/group-chat to collaboratively create a story.

## Core Features

### GM Control Panel

- Turn order management
- Actor selection
- Quality evaluation display
- Regeneration controls
- World state controls

### GM-Guided Story Creation

The user as Game Master has explicit control over narrative direction in group-chat mode:

- **Direct character prompts** — GM can target specific characters to respond
- **Scene description** — GM sets the current scene for all participants
- **Narrative constraints** — GM can constrain responses (in-character, topic, tone)
- **Turn priority** — GM can set high/medium/low priority for participant turns
- **Guidance commands** — `/guide`, `/target`, `/constraint`, `/scene`, `/skip`, `/priority` slash commands

### Quest Log

- Active quests display
- Quest objectives
- Quest progress
- Quest rewards
- Quest history

### World State Display

- Location changes
- NPC state changes
- Item transfers
- Time progression

### Turn Order Visualization

- Current actor highlight
- Turn queue display
- Actor status
- Context prompt display

## UI Components

### GM Panel Layout

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

### GM Guidance Panel

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

### Quest Log Layout

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

## Integration Points

### Backend Dependencies

| Backend System | What It Provides     | How Used               |
| -------------- | -------------------- | ---------------------- |
| Story System   | Turn management, GM  | Display turns, control |
| Quest System   | Quest CRUD, progress | Display quests         |
| World System   | World state, changes | Display world state    |
| Actor System   | Actor management     | Display actors         |

### Shared Components

| Component    | Used By              | Notes                     |
| ------------ | -------------------- | ------------------------- |
| Progress bar | Quest, Battle, World | Reusable progress display |
| Timeline     | Quest, World, Battle | Reusable history display  |
| Actor card   | Story, Battle, NPC   | Reusable actor display    |

### GM-Guided Story Creation Dependencies

| System                              | How It Integrates                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `epic-assistant-gm-flows.md`        | GM-guided story uses the same reconciliation infrastructure; the user-GM variant complements the assistant-GM variant |
| `epic-chat-lifecycle-moderation.md` | Group chat infrastructure provides participant management, turn order, message tree                                   |
| `docs/frontend/chat/group-chat.md`  | GM-guided story is documented as a variant of group chat                                                              |
| `docs/frontend/chat/assistant.md`   | Assistant-GM and user-GM are complementary roles                                                                      |
| `TASK-gm-guided-story-creation.md`  | Implementation tasks for GM-guided story creation                                                                     |

## Acceptance Criteria

- [x] GM control panel renders GM notes and panel entities inside chat (`src/frontend/alpine/gm-panel.ts`, `src/components/chat/gm-panel.html`).
- [x] Quest panel renders the active quests for the chat's world (`src/components/chat/gm-quests-panel.html` against `src/routes/quests/`).
- [x] GM-guided story creation: `/guide`, `/target`, `/constraint`, `/scene`, `/skip`, `/priority` are handled in story mode — recognised via `activeChat.mode === 'story'` **or** `gm_config.storyMode` (`src/frontend/alpine/gm-guidance.ts`, `src/assistant/commands/gm-guidance.ts`).
- [x] Story state is readable in chat via fetch-based read models (`src/frontend/alpine/story-state/`).
- [ ] World-state and NPC-state editing is reachable from chat (backend routes exist under `src/routes/story-states/`; the frontend CRUD tickets are open).
- [ ] Turn-order visualization shows the current actor, the queue and actor status — no turn-order frontend module exists yet.
- [ ] The story-state SSE subscription contract is written down and the story-state read models use it instead of polling.
- [ ] The story surfaces are keyboard operable and expose accessible names for screen readers.

## Implementation Phases

### Phase 1: GM Panel

- Turn order management
- Actor selection
- Quality evaluation

### Phase 2: Quest Log

- Quest list
- Quest details
- Quest progress

### Phase 3: World State

- World state display
- Change history
- State editing

### Phase 4: GM-Guided Story Creation

- GM guidance panel (narrative direction, character targeting, constraints, turn priority)
- `/guide` and related slash commands
- GM role wiring in group chat participant types
- GM-guided story variant documentation

### Phase 5: Polish

- Mobile responsive
- Keyboard accessible
- Screen reader support

## Linked Tasks

Bound to this epic via the `**Epic:** epic-story-mode-ui` header on each ticket.

- `TASK-gm-panel.md` — GM panel
- `TASK-quest-log.md` — Quest log
- `TASK-story-world-state.md` — World state display
- `TASK-story-turn-order.md` — Turn order
- `TASK-story-alpine.md` — Story Alpine.js logic
- `TASK-clarify-story-state-sse-subscription-contract.md` — SSE contract decision
- `TASK-frontend-story-world-states-crud.md` — world-state editing UI
- `TASK-frontend-story-npc-state.md` — NPC-state GET/PUT UI
- `TASK-frontend-story-turn-by-id.md` — turn-by-id lookup UI
- `FEAT-multi-llm-story-mode-frontend.md`
- `BUG-chat-settings-modal-invalid-mode.md`
- `FEAT-chat-template-config-lifecycle.md`

### Cross-epic references

Owned by another epic — listed here for traceability, **not** bound here:

- `TASK-gm-guided-story-creation.md` — bound to `epic-assistant-gm-flows.md`; shipped as `src/frontend/alpine/gm-guidance.ts` + `src/components/chat/gm-guidance-panel.html`.
- `TASK-frontend-story-mode-ui.md` — bound to `epic-assistant-gm-flows.md`; umbrella for the story-mode frontend.

## Frontend Surface

Paths verified against `src/`. Landed:

- `src/frontend/alpine/gm-panel.ts` (+ `gm-panel-entities.ts`, `gm-panel-types.ts`) — GM control panel
- `src/frontend/alpine/gm-guidance.ts` — GM guidance commands
- `src/frontend/alpine/story-state.ts` + `src/frontend/alpine/story-state/` — story-state read models
- `src/components/chat/gm-panel.html`, `gm-guidance-panel.html`, `gm-quests-panel.html`, `gm-story-panel.html`

Not built yet (no such module exists): turn-order visualization, and the editing side of
world-state / NPC-state. The `src/frontend/story/` tree named in earlier revisions of this
doc was never created — the Alpine modules above are where this surface actually lives.

## Related Epics

- **Epic Story Mode** — Backend story system
- **Epic Quest System** — Backend quest system
- **Epic World & Locations** — Backend world system
- **Epic Assistant/GM Flows** — GM flow reconciliation; GM-guided story uses same infrastructure
- **Epic Chat Lifecycle & Moderation** — Group chat infrastructure
