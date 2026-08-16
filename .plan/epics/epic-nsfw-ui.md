<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: NSFW Interaction UI

**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** Medium
**Type:** Feature Epic
**Tags:** nsfw, intimacy, ui, frontend

## Summary

Complete NSFW interaction interface for intimacy system, body state display, health/disease status, and housing management. Required to make NSFW game mechanics usable.

## Core Features

### Intimacy Interaction Interface

- Intimacy action selection
- Partner selection
- Action effects display
- Consent confirmation
- Privacy controls

### Body State Display

- Body部位 status indicators
- Health/disease status
- Mood/happiness display
- Fatigue/stamina display

### Housing Management

- Housing overview
- Room customization
- Furniture placement
- Storage management

## UI Components

### Intimacy Interface Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Intimacy: Private Chamber                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Partners ───────────────────────────────────────────────┐│
│ │ [Alice] [Bob] [Select Partner...]                        ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Actions ────────────────────────────────────────────────┐│
│ │ 💋 Kiss  🤗 Embrace  💬 Talk  🎭 Play  💤 Rest          ││
│ │                                                         ││
│ │ Selected: 💋 Kiss                                        ││
│ │ Effects: +10 Affection, +5 Mood                         ││
│ │ Duration: 5 minutes                                     ││
│ │ Requirements: None                                      ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Body State ─────────────────────────────────────────────┐│
│ │ ❤️ Health: 95%  😊 Mood: 80%  ⚡ Energy: 70%            ││
│ │ 🩺 Status: Healthy                                      ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│                          [Cancel]  [Confirm Action]         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Body State Widget

```
┌─ Body State: Alice ──────────────────────────────────────────┐
│                                                               │
│ ❤️ Health                                                     │
│ ████████████████████░░░░ 95%                                  │
│                                                               │
│ 😊 Mood                                                       │
│ ████████████████░░░░░░░░ 80%                                  │
│                                                               │
│ ⚡ Energy                                                     │
│ ██████████████░░░░░░░░░░ 70%                                  │
│                                                               │
│ 🩺 Status                                                     │
│ [Healthy] [Well-Rested] [Happy]                               │
│                                                               │
│ 📊 Stats                                                      │
│ Affection: 85/100                                             │
│ Trust: 90/100                                                 │
│ Comfort: 75/100                                               │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Housing Management Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Housing: Player Home                      [+ Add Room]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Rooms ──────────────────────────────────────────────────┐│
│ │ 🛏️ Bedroom (2 beds, 1 storage)                          ││
│ │ 🍳 Kitchen (stove, fridge, table)                        ││
│ │ 📚 Library (bookshelf, desk, chair)                      ││
│ │ 🏋️ Training Room (dummies, rack)                         ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Selected: Bedroom ─────────────────────────────────────┐│
│ │                                                         ││
│ │ Furniture:                                              ││
│ │ [Bed] [Wardrobe] [Nightstand] [Mirror]                  ││
│ │                                                         ││
│ │ Storage: 12/20 slots                                    ││
│ │ Items: [Blanket] [Pillow] [Clothes]                     ││
│ │                                                         ││
│ │ Effects: +10% Rest Speed, +5% Comfort                   ││
│ │                                                         ││
│ │ [Edit] [Move] [Remove]                                  ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Global Effects ─────────────────────────────────────────┐│
│ │ 🏠 Home Bonus: +10% All Stats                           ││
│ │ 🔒 Privacy: High                                        ││
│ │ 💰 Maintenance: 50 gold/day                             ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Integration Points

### Backend Dependencies

| Backend System  | What It Provides          | How Used                 |
| --------------- | ------------------------- | ------------------------ |
| Intimacy System | Intimacy actions, effects | Display actions, trigger |
| Body Systems    | Body state, health        | Display body state       |
| Disease System  | Disease status, effects   | Display health status    |
| Housing System  | Housing CRUD, effects     | Display housing          |
| Weather System  | Weather effects           | Display environmental    |

### Shared Components

| Component            | Used By               | Notes                      |
| -------------------- | --------------------- | -------------------------- |
| Health bar widget    | NSFW, Battle, NPC     | Reusable across systems    |
| Status effect badges | NSFW, Battle, Disease | Shared buff/debuff display |
| Action button grid   | NSFW, Battle          | Similar action selection   |

## Acceptance Criteria

- [ ] Intimacy action selection interface
- [ ] Partner selection UI
- [ ] Action effects display
- [ ] Consent confirmation dialog
- [ ] Privacy controls
- [ ] Body state display (health, mood, energy)
- [ ] Status indicators
- [ ] Housing overview
- [ ] Room customization
- [ ] Furniture placement
- [ ] Storage management
- [ ] Mobile responsive
- [ ] Keyboard accessible
- [ ] Screen reader support

## Implementation Phases

### Phase 1: Intimacy Interface

- Intimacy action selection
- Partner selection
- Action effects display

### Phase 2: Body State

- Health/mood/energy display
- Status indicators
- Stats display

### Phase 3: Housing

- Housing overview
- Room management
- Furniture placement

### Phase 4: Polish

- Mobile responsive
- Keyboard accessible
- Screen reader support

## Tasks

| Task                            | Priority | Status         |
| ------------------------------- | -------- | -------------- |
| TASK-nsfw-intimacy-interface.md | P0       | ⬜ Not Started |
| TASK-nsfw-body-state.md         | P0       | ⬜ Not Started |
| TASK-nsfw-housing-management.md | P0       | ⬜ Not Started |
| TASK-nsfw-alpine.md             | P0       | ⬜ Not Started |

## Files to Create

- `src/frontend/nsfw/intimacy-interface.ts` — Intimacy UI
- `src/frontend/nsfw/body-state.ts` — Body state widget
- `src/frontend/nsfw/housing-management.ts` — Housing UI
- `src/frontend/alpine/nsfw.ts` — Alpine.js NSFW logic

## Related Epics

- **Epic NSFW Game Mechanics** — Backend NSFW system
- **Epic Housing Base Building** — Backend housing system
- **Epic Disease & Poison** — Backend disease system
