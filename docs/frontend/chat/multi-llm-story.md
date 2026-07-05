# Chat: Multi-LLM Story Generation with Game Master

> ⚠️ **Implementation status:** Backend story module (`src/story/`) partially implemented (turn manager, game master, quest engine, world state). 
> Frontend UI (story mode chat view, GM panel, quest log, story-specific templates) does NOT exist.
> Story API endpoints are NOT wired into the route router. This spec is aspirational.

## Overview

This feature introduces **multi-LLM collaborative story generation** where multiple LLMs take turns developing a story, guided by an **Assistant LLM acting as Game Master** (or a human Game Master). The system supports:

- **Turn-based LLM responses** — multiple AI characters/narrators respond in sequence
- **Game Master orchestration** — Assistant LLM (or human) manages turn order, analyzes responses, regenerates poor quality outputs
- **World state evolution** — story events update world lore, locations, NPC states
- **Global quest system** — time-based, item-collection, enemy-defeat, NPC-rescue quests tracked at world level
- **Automated testing via synthetic data** — generate test scenarios from chat interactions

---

## Core Concepts

### Chat Mode: `story` (New Chat Type)

Extends the existing chat types with a new mode:

| Mode        | Participants                         | Assistant Role            | Primary Use                            |
| ----------- | ------------------------------------ | ------------------------- | -------------------------------------- |
| `direct`    | User × Character                     | Optional mediator         | Standard roleplay                      |
| `group`     | Multiple users/characters            | Optional GM               | Collaborative storytelling             |
| **`story`** | **Multiple LLMs + optional User/GM** | **Required: Game Master** | **Autonomous/guided story generation** |

### Actor Roles in Story Mode

| Actor Type  | Agent Type    | Description                                                                         |
| ----------- | ------------- | ----------------------------------------------------------------------------------- |
| `character` | `ai`          | LLM-driven character (PC or NPC)                                                    |
| `character` | `npc`         | Non-player character with simpler AI                                                |
| `narrator`  | `narrator`    | Narrator agent — describes scenes, time passing, environmental changes              |
| `system`    | `game_master` | **Game Master** — orchestrates turns, evaluates quality, manages quests/world state |
| `user`      | `none`        | Human player (optional participant)                                                 |

---

## Turn-Taking Architecture

### Turn Manager Service

The story module is organized into these files:

1. **`src/story/turn-manager.ts`** — Core turn orchestration
2. **`src/story/game-master.ts`** — Game Master logic (LLM or human)
3. **`src/story/quality-evaluator.ts`** — Response quality analysis
4. **`src/story/world-state.ts`** — World state mutation from story events
5. **`src/story/quest-engine.ts`** — Global quest tracking & progression
6. **`src/story/synthetic-generator.ts`** — Automated test data generation
7. **`src/story/types.ts`** — Shared types
8. **`src/story/index.ts`** — Exports

### Turn Flow

A story turn cycle progresses through seven stages:

**Stage 1 — Game Master selects next actor**
- Based on: turn order strategy, scene context, actor availability
- Considers: quest objectives, character motivations
- Outputs: `actor_id`, `context_prompt`, `turn_constraints`

**Stage 2 — Selected actor generates response**
- Receives: full context (world state, chat history, GM prompt)
- Generates: response per actor's system prompt + style guidelines
- Returns: `content`, `token usage`, `reasoning` (if exposed)

**Stage 3 — Quality evaluator analyzes response**
- Checks: coherence, character voice, plot consistency
- Scores: 0-100 (configurable thresholds)
- Flags: OOC, lore contradiction, quality issues
- Decision: one of three paths:
  - **ACCEPT** → persist message, continue to stage 5
  - **REGENERATE** → retry generation (max N times), loop back to stage 2
  - **ESCALATE** → GM (human or LLM) reviews and decides

**Stage 4 — Persist message** (after ACCEPT or GM approval)

**Stage 5 — World state engine processes events**
- Extracts: location changes, NPC state, item transfers
- Updates: world lore, location descriptions, quest progress
- Triggers: quest progress updates, time advancement
- Emits: events for UI, logging, synthetic generation

**Stage 6 — Quest engine evaluates progress**
- Time-based: location/world time progression
- Collection: item acquisition tracking
- Combat: enemy HP, defeat conditions
- Rescue: NPC location, safety status
- Awards: XP, world changes, narrative unlocks

**Stage 7 — Synthetic generator captures scenario** (if enabled)
- Records: turn sequence, decisions, outcomes
- Generates: test cases, regression scenarios
- Stores: in `synthetic_data` table for CI/CD

### Turn Order Strategies

| Strategy       | Description                                | Use Case            |
| -------------- | ------------------------------------------ | ------------------- |
| `round_robin`  | Fixed order: Actor A → B → C → A...        | Equal participation |
| `scene_based`  | GM selects based on scene relevance        | Narrative-driven    |
| `initiative`   | Roll/score determines order per scene      | Combat/encounters   |
| `quest_driven` | Prioritize actors relevant to active quest | Goal-oriented       |
| `hybrid`       | GM chooses strategy per turn               | Maximum flexibility |

---

## Game Master Architecture

### Game Master Types

```typescript
type GameMasterType = "llm" | "human" | "hybrid";

interface GameMasterConfig {
  type: GameMasterType;
  llmConfig?: {
    model: string;
    provider: string;
    systemPrompt: string; // "You are the Game Master..."
    temperature: number;
  };
  humanGM?: {
    actorId: string; // Human user's actor ID
    notifications: boolean;
  };
  // Hybrid: LLM handles routine, escalates complex to human
  escalationThreshold?: number; // Quality score below which human reviews
}
```

### Game Master Responsibilities

| Responsibility              | LLM GM          | Human GM | Hybrid           |
| --------------------------- | --------------- | -------- | ---------------- |
| Turn selection              | ✅              | ✅       | ✅ (LLM default) |
| Quality evaluation          | ✅              | ✅       | ✅ (LLM default) |
| Regeneration decisions      | ✅              | ✅       | ✅ (LLM default) |
| Quest creation/modification | ✅              | ✅       | ✅ (Human final) |
| World lore authority        | Advisory        | ✅ Final | ✅ Human final   |
| NPC personality consistency | ✅              | ✅       | ✅               |
| Rule adjudication           | ✅ (configured) | ✅       | ✅ Human final   |

### Game Master System Prompt (LLM GM)

```text
You are the Game Master for a collaborative story.

WORLD CONTEXT:
{world_lore}
{current_location}
{active_quests}
{time_of_day}
{weather}

ACTORS IN THIS STORY:
{actor_list_with_motivations}

CURRENT SCENE:
{scene_summary}

YOUR ROLE:
1. Select the next actor to act based on narrative relevance
2. Provide a focused prompt for that actor (max 500 tokens)
3. Evaluate responses for: character voice, plot coherence, lore consistency
4. Score responses 0-100. Below 60 = regenerate. Below 40 = escalate.
5. Track quest progress and world state changes
6. Inject narration messages for time skips, scene transitions, environmental changes

OUTPUT FORMAT (JSON):
{
  "nextActorId": "uuid",
  "turnPrompt": "Specific direction for this actor...",
  "turnConstraints": { "maxTokens": 800, "tone": "tense", "focus": "dialogue" },
  "narration": "Optional scene-setting narration to inject before turn",
  "questUpdates": [{ "questId": "uuid", "progress": 25, "note": "Found first clue" }],
  "worldStateChanges": [{ "type": "location_change", "actorId": "uuid", "newLocation": "cave" }]
}
```

---

## Quality Evaluation

### Evaluation Dimensions

| Dimension           | Weight | Description                                           |
| ------------------- | ------ | ----------------------------------------------------- |
| `character_voice`   | 0.25   | Consistent personality, speech patterns, vocabulary   |
| `plot_coherence`    | 0.20   | Logical follow-up to previous events                  |
| `lore_consistency`  | 0.20   | No contradictions with world facts                    |
| `narrative_quality` | 0.15   | Engaging prose, show-don't-tell, pacing               |
| `quest_relevance`   | 0.10   | Advances or meaningfully interacts with active quests |
| `creativity`        | 0.10   | Novel ideas, unexpected but plausible developments    |

### Quality Thresholds (Configurable)

```typescript
interface QualityThresholds {
  accept: 70; // Auto-accept
  regenerate: 40; // Request regeneration (max 3 attempts)
  escalate: 40; // Below this: human GM review required
  maxRegenerations: 3;
}
```

### Regeneration Strategy

1. **First failure**: Same prompt, temperature +0.1
2. **Second failure**: Add explicit correction hint from evaluator
3. **Third failure**: Simplify prompt, reduce context, try different model
4. **All failed**: Escalate to GM with all attempts for review

---

## World State Evolution

### Event Extraction from Messages

The World State Engine parses accepted messages for **state-changing events**:

```typescript
type WorldEventType =
  | "location_change" // Actor moves to new location
  | "npc_state_change" // NPC relationship, health, knowledge
  | "item_transfer" // Item gained/lost/traded
  | "time_advancement" // Explicit time skip
  | "location_modification" // Location description changed
  | "world_lore_update" // New fact added to world lore
  | "quest_progress" // Quest objective advanced
  | "combat_event"; // Damage, defeat, status effects
```

### Event Extraction Pipeline

World events are extracted from message content through a three-stage pipeline:

**Stage 1 — LLM Extractor**
- Takes raw message content as input
- Lightweight model with structured output (few-shot prompted)
- Schema: `WorldEvent[]` — location changes, NPC state changes, item transfers, etc.

**Stage 2 — Validator**
- Rule-based validation against known state
- Checks: valid locations, existing NPCs, valid items, consistent timestamps
- Cross-references extracted events against current world state

**Stage 3 — Applier**
- Transactional DB updates
- Updates: actors (stats, location, equipment), world (lore, descriptions), quests (progress)
- Emits events for UI update and synthetic generator

### World State Persistence

New tables for dynamic world state:

```sql
-- World state snapshots (for rollback, history, synthesis)
CREATE TABLE world_states (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id),
  snapshot_json TEXT NOT NULL,  -- Full serialized state
  trigger_message_id TEXT REFERENCES messages(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- NPC dynamic state (separate from static actor definition)
CREATE TABLE npc_states (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id),  -- actor_type='character', agent_type='npc'
  world_id TEXT NOT NULL REFERENCES worlds(id),
  location_id TEXT REFERENCES locations(id),
  health INTEGER DEFAULT 100,
  mental_state TEXT DEFAULT 'calm',  -- calm, afraid, angry, suspicious, etc.
  knowledge JSON DEFAULT '{}',       -- What NPC knows (facts, rumors, secrets)
  relationships JSON DEFAULT '{}',   -- {actor_id: disposition(-100 to 100)}
  inventory JSON DEFAULT '[]',       -- Items NPC carries
  schedule JSON DEFAULT '{}',        -- Time-based behavior patterns
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Location dynamic state
CREATE TABLE location_states (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id),
  world_id TEXT NOT NULL REFERENCES worlds(id),
  description_override TEXT,         -- Temporary description change
  atmosphere TEXT,                   -- Current mood: tense, peaceful, eerie
  npcs_present JSON DEFAULT '[]',    -- Actor IDs currently here
  items_available JSON DEFAULT '[]', -- Items findable here
  time_of_day TEXT,                  -- morning, afternoon, evening, night
  weather TEXT,                      -- clear, rain, storm, fog
  hazards JSON DEFAULT '[]',         -- Active environmental hazards
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## Global Quest System

### Quest Types

| Type            | Identifier    | Progression Mechanic         | Completion Condition                     |
| --------------- | ------------- | ---------------------------- | ---------------------------------------- |
| **Time-based**  | `time`        | World/time location progress | Reach time threshold or survive duration |
| **Collection**  | `collection`  | Item acquisition count       | Collect N items (specific or category)   |
| **Destruction** | `destruction` | Enemy HP / defeat count      | Defeat target enemy/entity               |
| **Rescue**      | `rescue`      | NPC location/safety status   | Move NPC to safe location                |
| **Discovery**   | `discovery`   | Location/event uncovering    | Find hidden location/secret              |
| **Social**      | `social`      | NPC relationship thresholds  | Reach relationship level with NPC        |
| **Composite**   | `composite`   | Multiple sub-quests          | All sub-quests complete                  |

### Quest Schema

```sql
CREATE TABLE quests (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id),
  creator_id TEXT NOT NULL REFERENCES actors(id),  -- GM or system
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,  -- 'time' | 'collection' | 'destruction' | 'rescue' | 'discovery' | 'social' | 'composite'
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'failed' | 'abandoned'
  priority INTEGER DEFAULT 0,  -- Higher = more urgent for GM attention

  -- Type-specific config (JSON)
  config JSON NOT NULL,  -- See type configs below

  -- Progress tracking
  progress INTEGER DEFAULT 0,  -- 0-100 or absolute count
  target INTEGER NOT NULL,     -- Target value for completion

  -- Time-based quests
  start_time TEXT,             -- ISO timestamp
  deadline TEXT,               -- ISO timestamp (null = no deadline)
  time_location_id TEXT REFERENCES locations(id),  -- Location whose time tracks

  -- Rewards
  rewards JSON DEFAULT '{}',   -- XP, items, world changes, lore unlocks

  -- Narrative
  narrative_hooks JSON DEFAULT '[]',  -- Story beats at progress milestones

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
```

### Type-Specific Configs

```typescript
// Time-based
interface TimeQuestConfig {
  type: "time";
  durationMinutes: number; // Real-time or in-game time
  trackInGameTime: boolean; // Use world clock vs real clock
  locationId?: string; // Specific location's time
  milestones: { progress: number; narrative: string }[];
}

// Collection
interface CollectionQuestConfig {
  type: "collection";
  items: { itemId: string; quantity: number }[]; // Specific items
  // OR category-based:
  category?: string; // e.g., "herbs", "gems", "documents"
  categoryQuantity?: number; // Any 10 herbs
  sources: string[]; // Where items can be found: location IDs, NPC IDs, "any"
}

// Destruction
interface DestructionQuestConfig {
  type: "destruction";
  targetActorId: string; // Enemy actor to defeat
  // OR target type:
  targetType?: string; // e.g., "undead", "bandits"
  targetQuantity?: number; // Defeat 5 bandits
  combatRules?: {
    // Optional custom combat
    hpMultiplier: number;
    specialWeaknesses: string[];
  };
}

// Rescue
interface RescueQuestConfig {
  type: "rescue";
  targetActorId: string; // NPC to rescue
  safeLocationId: string; // Location considered "safe"
  escortRequired: boolean; // Must be accompanied
  timeLimitMinutes?: number; // Optional time pressure
  threats: string[]; // Actor IDs or types threatening NPC
}

// Discovery
interface DiscoveryQuestConfig {
  type: "discovery";
  targetLocationId?: string; // Specific hidden location
  // OR discovery type:
  discoveryType?: "location" | "secret" | "lore" | "path";
  clues: { locationId: string; hint: string }[]; // Clue locations
  revealOnComplete: string; // What becomes known/accessible
}

// Social
interface SocialQuestConfig {
  type: "social";
  targetActorId: string; // NPC to build relationship with
  targetDisposition: number; // -100 to 100
  requiredInteractions: number; // Minimum meaningful interactions
  favoredTopics: string[]; // Conversation topics that help
  disfavoredActions: string[]; // Actions that hurt progress
}

// Composite
interface CompositeQuestConfig {
  type: "composite";
  subQuests: string[]; // Quest IDs
  logic: "all" | "any" | "sequence"; // All must complete, any one, or in order
}
```

### Quest Progression Integration

When a story event occurs, the quest engine evaluates it through this 4-step journey:

1. **Story Event Occurs** — World State Engine emits an event (location change, NPC dialogue, item pickup, combat result)
2. **Quest Engine Evaluates** — `matchEvent()` checks all active quests against event type, triggering matched quests
3. **For Each Match** — Update progress, check completion conditions, trigger narrative hooks, award rewards (XP, items, world changes)
4. **Branch** — If progress-only: update quest progress, check milestones, inject narration. If complete: mark quest completed, apply rewards, unlock narrative branches, update world state, notify GM/players, spawn follow-up quests

---

## Automated Testing: Synthetic Data Generation

### Purpose

Generate realistic test scenarios from actual story generation runs for:

- Regression testing of turn-taking logic
- Quality evaluator calibration
- Quest engine validation
- World state consistency checks
- Performance benchmarking

### Synthetic Data Types

| Type                     | Source                      | Use Case                        |
| ------------------------ | --------------------------- | ------------------------------- |
| `turn_sequence`          | Complete turn cycles        | Test turn manager, GM decisions |
| `quality_evaluation`     | Message + score + reasoning | Train/calibrate evaluator       |
| `quest_progression`      | Event → quest update        | Test quest logic                |
| `world_state_transition` | Before/after state          | Test state engine               |
| `regeneration_case`      | Original + regenerated      | Test regeneration logic         |
| `gm_escalation`          | Low-quality + GM decision   | Test escalation paths           |

### Generation Pipeline

When a story session completes (or hits a checkpoint), synthetic data flows through 4 stages:

1. **Synthetic Generator Analyzes Session** — Extracts all turn cycles, captures context/prompts/responses, records quality scores and decisions, tracks world state before/after each turn
2. **Split into Three Output Types:**
   - **Turn Sequences** — Full turn-by-turn replay data
   - **Quality Cases** — Edge cases for quality evaluation validation
   - **Quest/World State** — Progression and state transition data
3. **Synthetic Data Store** — Persisted in `synthetic_scenarios` table with: `scenario_type`, `input_context` (JSON), `expected_output` (JSON), metadata (session_id, turn, actors), and tags (regression, quality, quest)
4. **Test Runner Consumes Scenarios** — Unit tests replay turns with same input, integration tests do full session replay, property-based tests mutate inputs and check invariants (e.g., quest progress never decreases)

### Synthetic Scenarios Table

```sql
CREATE TABLE synthetic_scenarios (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,  -- Source story session
  scenario_type TEXT NOT NULL,  -- 'turn_sequence' | 'quality_evaluation' | 'quest_progression' | 'world_state_transition' | 'regeneration_case' | 'gm_escalation'
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON array of tags

  -- Input: what the system received
  input_context JSON NOT NULL,  -- Full context sent to actor/GM/evaluator

  -- Expected output: what the system produced (ground truth)
  expected_output JSON NOT NULL,

  -- Metadata for filtering/selection
  metadata JSON NOT NULL DEFAULT '{}',  -- turn_number, actor_ids, quest_ids, quality_score, etc.

  -- Validation: assertions that must hold
  assertions JSON DEFAULT '[]',  -- e.g., ["progress >= 0", "progress <= 100"]

  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Test Execution Modes

| Mode          | Description                                                      | CI Integration   |
| ------------- | ---------------------------------------------------------------- | ---------------- |
| `replay`      | Exact replay: same input → expect same output                    | Unit tests       |
| `mutation`    | Mutate input (temperature, prompt variations) → check invariants | Property tests   |
| `regression`  | Compare current output vs stored expected output                 | Regression suite |
| `calibration` | Run evaluator on quality cases → adjust thresholds               | Model eval       |
| `stress`      | Rapid-fire synthetic sessions → measure latency, errors          | Load tests       |

---

## API Endpoints

### Story Chat Management

```
POST   /api/chats/story              # Create story-mode chat
GET    /api/chats/:id/story/state    # Get current story state (turn, actors, quests)
POST   /api/chats/:id/story/start    # Begin autonomous generation
POST   /api/chats/:id/story/pause    # Pause generation
POST   /api/chats/:id/story/resume   # Resume generation
POST   /api/chats/:id/story/step     # Single turn (for testing/debugging)
POST   /api/chats/:id/story/configure # Update GM config, turn order, thresholds
```

### Game Master

```
POST   /api/chats/:id/gm/turn        # Request GM decision for next turn
GET    /api/chats/:id/gm/history     # GM decision log
POST   /api/chats/:id/gm/override    # Human GM override
POST   /api/chats/:id/gm/escalate    # Escalate current turn to human
```

### Quality & Regeneration

```
POST   /api/messages/:id/evaluate    # Trigger quality evaluation
POST   /api/messages/:id/regenerate  # Request regeneration
GET    /api/messages/:id/attempts    # List generation attempts
```

### Quests

```
GET    /api/worlds/:worldId/quests           # List quests
POST   /api/worlds/:worldId/quests           # Create quest (GM)
GET    /api/quests/:id                       # Quest detail
PATCH  /api/quests/:id                       # Update quest (GM)
POST   /api/quests/:id/progress              # Manual progress update (GM)
GET    /api/quests/:id/history               # Progress history
```

### World State

```
GET    /api/worlds/:worldId/state            # Current world state snapshot
GET    /api/worlds/:worldId/state/history    # State history
GET    /api/worlds/:worldId/npcs/:actorId    # NPC dynamic state
GET    /api/worlds/:worldId/locations/:id    # Location dynamic state
```

### Synthetic Data

```
GET    /api/synthetic/scenarios              # List with filters
POST   /api/synthetic/scenarios              # Create manual scenario
GET    /api/synthetic/scenarios/:id          # Get scenario
POST   /api/synthetic/generate               # Trigger generation from session
POST   /api/synthetic/test/run               # Run test suite
GET    /api/synthetic/test/results/:runId    # Test results
```

---

## Configuration

```yaml
story:
  enabled: true

  # Turn management
  turnManager:
    defaultStrategy: "hybrid"
    maxTurnsPerSession: 1000
    turnTimeoutMs: 120000
    autoAdvanceOnTimeout: true

  # Game Master
  gameMaster:
    defaultType: "llm"
    llm:
      model: "claude-3.5-sonnet"
      provider: "anthropic"
      temperature: 0.7
      maxTokens: 2000
    hybrid:
      escalationThreshold: 40
      humanGMActorId: null # Set when human GM joins

  # Quality evaluation
  qualityEvaluator:
    enabled: true
    model: "claude-3.5-sonnet" # Can use cheaper model
    thresholds:
      accept: 70
      regenerate: 40
      escalate: 40
    maxRegenerations: 3
    dimensions:
      characterVoice: 0.25
      plotCoherence: 0.20
      loreConsistency: 0.20
      narrativeQuality: 0.15
      questRelevance: 0.10
      creativity: 0.10

  # World state
  worldState:
    enabled: true
    snapshotInterval: 10 # Snapshot every N turns
    maxSnapshots: 100
    eventExtractorModel: "claude-3-haiku"

  # Quest engine
  questEngine:
    enabled: true
    autoGenerateFromEvents: true
    progressNotificationInterval: 10 # Notify GM every N%

  # Synthetic data generation
  syntheticGenerator:
    enabled: false # Enable for test environments
    generateOnSessionEnd: true
    generateOnCheckpoint: 50 # Every N turns
    scenarioTypes:
      - "turn_sequence"
      - "quality_evaluation"
      - "quest_progression"
      - "world_state_transition"
      - "regeneration_case"
      - "gm_escalation"
    maxScenariosPerSession: 100
    retentionDays: 30
```

---

## UI/UX Considerations

### Story Mode Chat View

A story-mode chat layout showing:

- **Header bar:** World name ("Elderwood"), quest progress ("Find the Crown - 45%"), and controls (pause, play, skip)
- **Narration block:** World events and scene description (◆ NARRATION)
- **GM selection panel:** Indicates which actor is selected next and the prompt being used
- **Actor response bubbles:** Each shows character name, dialogue text, thinking/reasoning (💭), and quality score (87/100) with Regenerate/Details buttons
- **Quest update banner:** Progress percentage (+15%), milestone achievements
- **Footer:** Input disabled during generation, with GM Panel and Quest Log buttons

### GM Control Panel (Human GM)

A human GM dashboard showing:

- **Status bar:** Running indicator, current turn number (23), next actor (Sir Aldric)
- **Turn Order:** Numbered actor list with Ready/Waiting status, Move Up/Down/Skip controls, edit prompt button
- **Active Quests:** Progress bars for each active quest (Find the Crown 60%, Rescue Villagers 40%), New/Edit/Delete quest buttons
- **World State:** Current location, time (18:42), weather (Clear), NPCs present with add button
- **Quality Thresholds:** Configurable Accept (70), Regenerate (40), Escalate (40) thresholds with Apply Changes
- **Control Buttons:** Pause, Step, Escalate to Me, Inject Narration

---

## Implementation Phases

### Phase 1: Core Schema & Types (Week 1-2)

- [ ] Add `mode: 'story'` to chats table
- [ ] Extend `actors.agent_type` with `'game_master'`
- [ ] Add `npc_states`, `location_states`, `world_states` tables
- [ ] Add `quests` table with type-specific JSON configs
- [ ] Add `synthetic_scenarios` table
- [ ] Create Kysely migrations

### Phase 2: Turn Manager & Game Master (Week 3-4)

- [ ] Implement `TurnManager` service with strategy pattern
- [ ] Implement `GameMaster` service (LLM + human + hybrid)
- [ ] Implement turn selection, prompt construction
- [ ] Build GM decision logging/history

### Phase 3: Quality Evaluation & Regeneration (Week 4-5)

- [ ] Implement `QualityEvaluator` with configurable dimensions
- [ ] Build regeneration pipeline with exponential backoff
- [ ] Add escalation to human GM
- [ ] Integration with existing generation error handling

### Phase 4: World State Engine (Week 5-6)

- [ ] Implement event extraction from messages (LLM-based)
- [ ] Build validator and transactional applier
- [ ] NPC state, location state, world lore updates
- [ ] Snapshot/rollback mechanism

### Phase 5: Quest Engine (Week 6-7)

- [ ] Implement all 7 quest types with configs
- [ ] Progress tracking from world events
- [ ] Narrative hooks and reward distribution
- [ ] Composite quest support

### Phase 6: Synthetic Data Generation (Week 7-8)

- [ ] Implement `SyntheticGenerator` service
- [ ] Scenario extraction from completed sessions
- [ ] Test runner with replay/mutation/regression modes
- [ ] CI/CD integration examples

### Phase 7: API & UI Integration (Week 8-10)

- [ ] REST endpoints for all new functionality
- [ ] WebUI: Story chat view, GM panel, quest log
- [ ] TUI: Story mode components
- [ ] Real-time updates via WebSocket/htmx

### Phase 8: Polish & Documentation (Week 10-11)

- [ ] Comprehensive testing (unit, integration, synthetic)
- [ ] Performance optimization
- [ ] Documentation: API, user guide, GM guide
- [ ] Example story sessions

---

## Future Extensions

| Feature                         | Description                                 |
| ------------------------------- | ------------------------------------------- |
| **Multi-user story**            | Multiple humans + LLMs in same story        |
| **Story branching**             | Parallel timelines, merge/prune             |
| **LLM ensemble GM**             | Multiple LLMs vote on GM decisions          |
| **Procedural quest generation** | GM creates quests from world state          |
| **Cross-world story arcs**      | Quests spanning multiple worlds             |
| **Story export**                | Novel-format export, timeline visualization |
| **Voice/TTS integration**       | Narrated story playback                     |
| **Visual storyboards**          | AI-generated scene illustrations            |
