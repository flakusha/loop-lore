# EPIC: Story Mode UI

**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** story, gm, quest, ui, frontend

## Summary

Complete story mode interface including GM control panel, quest log, world state display, and turn order visualization. Required to make the story system usable.

## Core Features

### GM Control Panel

- Turn order management
- Actor selection
- Quality evaluation display
- Regeneration controls
- World state controls

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

### Quest Log Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Quest Log                                           [+ New] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Active Quests (3) ──────────────────────────────────────┐│
│ │                                                          ││
│ │ ⭐ Main Quest: The Ancient Prophecy                      ││
│ │    Objective: Find the three sacred artifacts            ││
│ │    Progress: 1/3 artifacts found                         ││
│ │    [View Details]                                        ││
│ │                                                          ││
│ │ 📜 Side Quest: Help the Village                          ││
│ │    Objective: Retrieve the stolen supplies               ││
│ │    Progress: 50% complete                                ││
│ │    [View Details]                                        ││
│ │                                                          ││
│ │ 🔍 Exploration: Ancient Ruins                            ││
│ │    Objective: Explore the hidden chambers                ││
│ │    Progress: 2/5 chambers discovered                     ││
│ │    [View Details]                                        ││
│ │                                                          ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Completed Quests (5) ───────────────────────────────────┐│
│ │ ✅ Welcome to the Village                                ││
│ │ ✅ First Steps                                           ││
│ │ ✅ The Merchant's Request                                ││
│ │ ✅ Into the Wild                                         ││
│ │ ✅ The Old Bridge                                        ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Failed Quests (1) ──────────────────────────────────────┐│
│ │ ❌ Race Against Time                                     ││
│ │    Reason: Time limit expired                            ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Quest Details Panel

```
┌─ Quest Details ────────────────────────────────────────────────┐
│                                                               │
│ ⭐ Main Quest: The Ancient Prophecy                           │
│ ─────────────────────────────────────────────────────────────│
│                                                               │
│ Description:                                                  │
│ An ancient prophecy speaks of three sacred artifacts          │
│ that must be united to prevent a great catastrophe.           │
│                                                               │
│ Objectives:                                                   │
│   ☑️ Find the Sword of Light                                  │
│   ☑️ Find the Shield of Darkness                             │
│   ☐ Find the Crown of Wisdom                                 │
│                                                               │
│ Progress: 2/3 (67%)                                          │
│                                                               │
│ Rewards:                                                      │
│   - 500 XP                                                   │
│   - Legendary Weapon                                          │
│   - World Reputation +50                                      │
│                                                               │
│ Time Limit: 7 days (3 days remaining)                        │
│                                                               │
│ [Abandon Quest] [View History] [Edit Quest]                   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
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

### Phase 4: Polish

- Mobile responsive
- Keyboard accessible
- Screen reader support

## Tasks

| Task                      | Priority | Status         |
| ------------------------- | -------- | -------------- |
| TASK-gm-panel.md          | P0       | ⬜ Not Started |
| TASK-quest-log.md         | P0       | ⬜ Not Started |
| TASK-story-world-state.md | P0       | ⬜ Not Started |
| TASK-story-turn-order.md  | P0       | ⬜ Not Started |
| TASK-story-alpine.md      | P0       | ⬜ Not Started |

## Files to Create

- `src/frontend/story/gm-panel.ts` — GM control panel
- `src/frontend/story/quest-log.ts` — Quest log
- `src/frontend/story/world-state.ts` — World state display
- `src/frontend/story/turn-order.ts` — Turn order visualization
- `src/frontend/alpine/story.ts` — Alpine.js story logic

## Related Epics

- **Epic Story Mode** — Backend story system
- **Epic Quest System** — Backend quest system
- **Epic World & Locations** — Backend world system
