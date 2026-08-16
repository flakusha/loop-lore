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

```
┌─────────────────────────────────────────────────────────────┐
│ Story Mode: The Forgotten Realms              [GM Controls] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Turn Order ─────────────────────────────────────────────┐│
│ │ Current: [Alice] (Player)                                ││
│ │ Next: [Bob] (NPC) → [Narrator] → [GM] → [Alice]        ││
│ │                                                          ││
│ │ [Skip Turn] [Reorder] [Add Actor] [Remove Actor]        ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Actor Details ──────────────────────────────────────────┐│
│ │ Alice (Player)                                           ││
│ │ Status: Ready                                            ││
│ │ Last Action: Investigated the ancient ruins              ││
│ │ Quality Score: 85/100                                    ││
│ │                                                          ││
│ │ [Edit Prompt] [View History] [Set Constraints]           ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Quality Evaluation ─────────────────────────────────────┐│
│ │ Last Response: Bob (NPC)                                 ││
│ │ Score: 72/100                                            ││
│ │ Issues:                                                  ││
│ │   - Minor OOC (out of character)                         ││
│ │   - Inconsistent with world lore                          ││
│ │                                                          ││
│ │ [Accept] [Regenerate] [Escalate to GM]                   ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ World State ────────────────────────────────────────────┐│
│ │ Location: Ancient Ruins                                  ││
│ │ Time: Day 45, 14:30                                      ││
│ │ Weather: Rainy                                           ││
│ │                                                          ││
│ │ Recent Changes:                                          ││
│ │   - Alice discovered hidden chamber                      ││
│ │   - Bob found ancient artifact                           ││
│ │   - Weather changed to rainy                             ││
│ │                                                          ││
│ │ [Edit World State] [View Full History]                   ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### GM Guidance Panel

```
┌─ GM Guidance ─────────────────────────────────────────────┐
│ Narrative Direction:                                       │
│ [ Focus on the mysterious door ] [Explore the forest]     │
│                                                          │
│ Target Character: [▼ Character Name]                     │
│ Constraints:                                               │
│ ☐ Stay in-character as a cautious elf                   │
│ ☑ No magic in this scene                                │
│ ☐ Tone: Mysterious                                      │
│                                                          │
│ Turn Priority:                                           │
│ Alice [High]  Bob [Medium]  Narrator [Low]              │
│                                                          │
│ [Apply Guidance] [Clear All]                            │
└─────────────────────────────────────────────────────────┘
```

### Quest Log Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Quest Log                                           [+ New] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Active Quests (3) ──────────────────────────────────┐│
│ │                                                          ││
│ │ ⭐ Main Quest: The Ancient Prophecy                    ││
│ │    Objective: Find the three sacred artifacts           ││
│ │    Progress: 1/3 artifacts found                        ││
│ │    [View Details]                                       ││
│ │                                                          ││
│ │ 📜 Side Quest: Help the Village                         ││
│ │    Objective: Retrieve the stolen supplies              ││
│ │    Progress: 50% complete                               ││
│ │    [View Details]                                       ││
│ │                                                          ││
│ │ 🔍 Exploration: Ancient Ruins                           ││
│ │    Objective: Explore the hidden chambers               ││
│ │    Progress: 2/5 chambers discovered                    ││
│ │    [View Details]                                       ││
│ │                                                          ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Completed Quests (5) ─────────────────────────────────┐│
│ │ ✅ Welcome to the Village                               ││
│ │ ✅ First Steps                                          ││
│ │ ✅ The Merchant's Request                               ││
│ │ ✅ Into the Wild                                        ││
│ │ ✅ The Old Bridge                                       ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Failed Quests (1) ───────────────────────────────────┐│
│ │ ❌ Race Against Time                                    ││
│ │    Reason: Time limit expired                           ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

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
