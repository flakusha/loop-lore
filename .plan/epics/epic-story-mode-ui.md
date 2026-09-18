<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Story Mode UI

**Status:** 🟡 In Progress (2026-08-01 — GM notes panel done; world/NPC/event controls + quest log + turn order pending)
**Priority:** P1 — High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** story, gm, quest, ui, frontend

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

- [ ] GM control panel with turn management
- [ ] Actor selection and management
- [ ] Quality evaluation display
- [ ] Regeneration controls
- [ ] Quest log with active/completed/failed
- [ ] Quest objectives and progress
- [ ] Quest rewards display
- [ ] World state display
- [ ] Turn order visualization
- [ ] Mobile responsive
- [ ] Keyboard accessible
- [ ] Screen reader support
- [ ] GM-guided story creation: user can direct characters in group chat, set scene constraints, control turn order
- [ ] `/guide`, `/target`, `/constraint`, `/scene`, `/skip`, `/priority` commands functional

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

## Tasks

| Task                             | Priority | Status         |
| -------------------------------- | -------- | -------------- |
| TASK-gm-panel.md                 | P0       | ⬜ Not Started |
| TASK-quest-log.md                | P0       | ⬜ Not Started |
| TASK-story-world-state.md        | P0       | ⬜ Not Started |
| TASK-story-turn-order.md         | P0       | ⬜ Not Started |
| TASK-story-alpine.md             | P0       | ⬜ Not Started |
| TASK-gm-guided-story-creation.md | P1       | ⬜ Not Started |

## Files to Create

- `src/frontend/story/gm-panel.ts` — GM control panel
- `src/frontend/story/quest-log.ts` — Quest log
- `src/frontend/story/world-state.ts` — World state display
- `src/frontend/story/turn-order.ts` — Turn order visualization
- `src/frontend/alpine/story.ts` — Alpine.js story logic
- `src/frontend/alpine/gm-guidance.ts` — GM guidance panel (new)

## Related Epics

- **Epic Story Mode** — Backend story system
- **Epic Quest System** — Backend quest system
- **Epic World & Locations** — Backend world system
- **Epic Assistant/GM Flows** — GM flow reconciliation; GM-guided story uses same infrastructure
- **Epic Chat Lifecycle & Moderation** — Group chat infrastructure
