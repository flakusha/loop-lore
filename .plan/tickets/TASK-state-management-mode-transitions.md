# TASK: State Management & Mode Transitions

**Epic:** RPG Mechanics & Extensible Game Systems
**Priority:** High
**Effort:** Large
**Status:** Not Started

## Summary

Implement state management and mode transitions for smooth switching between gameplay modes (question-based, battle, trading, interaction, etc.) with better immersion.

## Core Concerns

### Mode Transitions

- Smooth transitions between gameplay modes
- Explicit vs. implicit mode switching
- Immersion maintenance during mode changes
- Animations and effects for transitions
- Partial mode transitions (e.g., trading during battle)

### State Management

- Concurrent modes (e.g., trading during battle)
- Mode layering (base mode + overlay modes)
- State persistence across sessions
- Reversible mode transitions
- Mode conflict resolution

### Immersion

- Seamless mode switching
- Context-aware transitions
- Narrative continuity
- Visual/audio cues for mode changes
- Player expectation management

## Design

### Mode System

```typescript
interface GameMode {
  id: string;
  name: string;
  type: "base" | "overlay" | "interrupt";
  priority: number; // higher = more important
  stackable: boolean;
  transitions: ModeTransition[];
  state: ModeState;
}

interface ModeTransition {
  from: string; // mode ID
  to: string; // mode ID
  trigger: "manual" | "automatic" | "event" | "time";
  conditions: TransitionCondition[];
  effects: TransitionEffect[];
  reversible: boolean;
  animation: TransitionAnimation;
}

interface ModeState {
  active: boolean;
  data: Record<string, unknown>;
  history: ModeHistoryEntry[];
  persistence: "session" | "world" | "permanent";
}

interface TransitionAnimation {
  type: "fade" | "slide" | "zoom" | "dissolve" | "none";
  duration: number; // milliseconds
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  effects: AnimationEffect[];
}
```

### Mode Stack

```typescript
interface ModeStack {
  baseMode: string; // primary mode (e.g., 'exploration', 'chat')
  overlayModes: string[]; // stacked modes (e.g., 'inventory', 'quest_log')
  interruptModes: string[]; // interrupting modes (e.g., 'battle', 'dialogue')

  pushMode(mode: string, type: "overlay" | "interrupt",): void;
  popMode(mode: string,): void;
  switchMode(from: string, to: string,): void;
  getActiveModes(): string[];
  getModeState(mode: string,): ModeState;
}
```

### State Persistence

```typescript
interface StatePersistence {
  // Save mode state
  saveModeState(mode: string, state: ModeState,): Promise<void>;

  // Load mode state
  loadModeState(mode: string,): Promise<ModeState>;

  // Clear mode state
  clearModeState(mode: string,): Promise<void>;

  // Export all mode states
  exportModeStates(): Promise<Record<string, ModeState>>;

  // Import mode states
  importModeStates(states: Record<string, ModeState>,): Promise<void>;
}
```

### Transition Manager

```typescript
interface TransitionManager {
  // Check if transition is allowed
  canTransition(from: string, to: string,): boolean;

  // Execute transition
  executeTransition(from: string, to: string,): Promise<TransitionResult>;

  // Get available transitions
  getAvailableTransitions(currentMode: string,): ModeTransition[];

  // Get transition history
  getTransitionHistory(): TransitionHistoryEntry[];

  // Cancel transition
  cancelTransition(transitionId: string,): Promise<void>;
}

interface TransitionResult {
  success: boolean;
  from: string;
  to: string;
  duration: number;
  effects: TransitionEffect[];
  errors: string[];
}
```

## Mode Types

### Base Modes

- **Exploration**: Moving between locations, discovering areas
- **Chat**: Normal conversation with NPCs/players
- **Free-form**: Open-ended narrative (default LLM mode)

### Overlay Modes

- **Inventory**: Managing items and equipment
- **Quest Log**: Viewing active/completed quests
- **Map**: Viewing world map and locations
- **Character Sheet**: Viewing character stats and skills
- **Settings**: Adjusting game settings

### Interrupt Modes

- **Battle**: Turn-based combat
- **Dialogue**: Structured conversation with choices
- **Trading**: Buying/selling items
- **Crafting**: Creating items
- **Skill Check**: Rolling dice for skill checks
- **Cinematic**: Story cutscenes or important events

## Transition Scenarios

### Exploration → Battle

- Trigger: Enemy encounter or player attack
- Animation: Screen flash, battle music starts
- State: Save exploration position, load battle state
- Reversible: Yes (after battle ends)

### Chat → Dialogue

- Trigger: NPC conversation starts
- Animation: Focus on NPC, dialogue UI appears
- State: Save chat context, load dialogue tree
- Reversible: Yes (when dialogue ends)

### Exploration → Trading

- Trigger: Open shop or trade with NPC
- Animation: Shop UI slides in
- State: Save exploration state, load trade interface
- Reversible: Yes (when trade ends)

### Battle → Trading

- Trigger: Enemy offers trade during battle
- Animation: Battle pauses, trade UI appears
- State: Save battle state, load trade interface
- Reversible: Yes (when trade ends, battle resumes)

### Free-form → Question Mode

- Trigger: LLM generates question or player requests
- Animation: Question UI appears
- State: Save narrative context, load question interface
- Reversible: Yes (when question is answered)

## Tasks

- [ ] Design mode system architecture
- [ ] Implement mode stack management
- [ ] Implement state persistence
- [ ] Implement transition manager
- [ ] Implement transition animations
- [ ] Implement base modes (exploration, chat, free-form)
- [ ] Implement overlay modes (inventory, quest log, map, etc.)
- [ ] Implement interrupt modes (battle, dialogue, trading, etc.)
- [ ] Implement mode conflict resolution
- [ ] Implement transition triggers
- [ ] Implement transition conditions
- [ ] Implement transition effects
- [ ] Create mode management UI
- [ ] Create transition editor UI
- [ ] Write tests for state management

## Files

- `src/state/` — state management (does not exist yet)
- `src/state/mode.ts` — mode system
- `src/state/stack.ts` — mode stack
- `src/state/persistence.ts` — state persistence
- `src/state/transition.ts` — transition manager
- `src/state/animations.ts` — transition animations
- `src/db/schema-state.ts` — state tables
- `src/routes/state.ts` — state API
- `src/frontend/state/` — state UI components

## Open Questions

### Mode Transitions

- Should transitions be instant or animated?
- How to handle transition interruptions?
- Should transitions be queued or immediate?
- How to handle failed transitions?

### State Management

- How to handle state conflicts between modes?
- Should state be shared between modes or isolated?
- How to handle state corruption?
- Should state be versioned?

### Immersion

- How to maintain narrative continuity during transitions?
- Should transitions have narrative explanations?
- How to handle player expectations during mode switches?
- Should transitions be customizable?
