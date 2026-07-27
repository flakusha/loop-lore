# Visual Novel Specification

**Status:** Draft
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

This document defines the Visual Novel (VN) mode for loop-lore: scene management, branching choices, dynamic generation, and Q&A interaction patterns.

VN mode transforms the standard chat interface into a cinematic presentation with background scenes, character portraits, and dialogue boxes.

---

## 1. VN Data Model

### 1.1 Scene

```typescript
interface VNScene {
  id: string;
  chat_id: string;
  name: string;
  description: string;

  // Visual
  background: SceneBackground;
  characters: SceneCharacter[];
  transitions: SceneTransition;

  // Dialogue
  dialogue: VNDialogue[];
  choices: VNChoice[];

  // State
  state: VNSceneState;
  conditions: VNSceneCondition[];
  effects: VNSceneEffect[];
}

interface SceneBackground {
  asset_id: string | null; // reference to assets table
  color: string; // fallback color if no asset
  overlay: string | null; // overlay effect (fade, blur, etc.)
  parallax: boolean; // background parallax effect
}

interface SceneCharacter {
  actor_id: string;
  asset_id: string | null; // portrait asset
  position: "left" | "center" | "right";
  expression: string; // current expression state
  mood: string; // current mood state
  visible: boolean;
  animation: "idle" | "talking" | "thinking" | "moving" | "emoting";
}

interface SceneTransition {
  type: "fade" | "cut" | "dissolve" | "slide" | "wipe" | "zoom";
  duration: number; // seconds
  direction?: "in" | "out" | "both";
}
```

### 1.2 Dialogue

```typescript
interface VNDialogue {
  id: string;
  speaker: string; // actor_id
  text: string;
  type: "narration" | "dialogue" | "inner_thought" | "system";
  emotion: string | null; // emotional state modifier
  effects: DialogueEffect[];
  next: string | null; // next dialogue id or choice id
}

interface DialogueEffect {
  type: "mood_shift" | "expression_change" | "state_change" | "item_gain" | "relationship_change";
  target: string;
  value: number;
  immediate: boolean; // apply immediately or after dialogue
}
```

### 1.3 Choices

```typescript
interface VNChoice {
  id: string;
  text: string;
  conditions: VNChoiceCondition[];
  consequences: VNConsequence[];
  next_scene: string; // scene ID to transition to
  relationship_modifiers: RelationshipModifier[];
  mood_modifiers: MoodModifier[];
  item_modifiers: ItemModifier[];
}

interface VNChoiceCondition {
  type: "relationship" | "mood" | "item" | "quest" | "stat" | "flag";
  operator: "eq" | "gt" | "lt" | "gte" | "lte" | "has" | "not_has";
  value: number | string;
  actor_id?: string; // which actor's state to check
}

interface VNConsequence {
  type:
    | "scene_change"
    | "mood_shift"
    | "relationship_change"
    | "item_gain"
    | "location_change"
    | "flag_set"
    | "state_change";
  target: string;
  value: number;
  description: string;
}
```

---

## 2. Q&A Mode

### 2.1 Q&A Structure

```typescript
interface VNQuestion {
  id: string;
  scene_id: string;
  question_type: "lore" | "relationship" | "combat" | "exploration" | "social";
  question_text: string;
  options: VNQuestionOption[];
  next_scene_id: string;
  consequences: VNConsequence[];
  session_persistent: boolean; // does this persist across chat turns?
}

interface VNQuestionOption {
  id: string;
  text: string;
  emotion_modifier: number; // -100 to 100
  relationship_modifier: Record<string, number>; // actor_id → modifier
  next_scene_id: string;
  requirement: VNChoiceCondition | null;
}
```

### 2.2 Q&A Session State

```typescript
interface VNQASession {
  chat_id: string;
  current_question: VNQuestion | null;
  answer_history: VNAnswerEntry[];
  score: number;
  consequences_applied: string[];
  active: boolean;
}

interface VNAnswerEntry {
  question_id: string;
  option_id: string;
  timestamp: Date;
  consequence_applied: boolean;
  narrative_response: string; // LLM-generated response to the answer
}
```

---

## 3. Dynamic Generation

### 3.1 Generation Pipeline

```
Scene Trigger → Context Analysis → Image Generation → Story Generation → VN Rendering
```

### 3.2 Image Generation

```typescript
interface VNImageGeneration {
  scene_id: string;
  trigger: "scene_start" | "location_change" | "event" | "mood_shift";

  // Context for generation
  context: {
    location: string;
    time_of_day: string;
    weather: string;
    mood: string;
    characters: string[];
    mood_states: Record<string, string>;
  };

  // Generation parameters
  params: {
    style: "cinematic" | "illustration" | "pixel" | "anime";
    resolution: "low" | "medium" | "high";
    mood_tone: "bright" | "dark" | "neutral" | "dramatic";
    character_focus?: string; // which character to focus on
  };

  // Caching
  cache_key: string;
  cache_ttl: number; // seconds
  pregenerate: boolean; // generate ahead of time?
}
```

### 3.3 Story Generation

```typescript
interface VNStoryGeneration {
  scene_id: string;
  trigger: "new_scene" | "location_change" | "player_choice";

  // Context for generation
  context: {
    previous_scene: string | null;
    current_location: string;
    world_style: string;
    characters_present: string[];
    recent_events: string[];
    tone: string;
  };

  // Generation parameters
  params: {
    length: "short" | "medium" | "long";
    detail_level: "minimal" | "standard" | "rich";
    genre: string;
    include_narration: boolean;
    include_dialogue: boolean;
  };
}
```

---

## 4. Scene Template System

### 4.1 Template Variables

```typescript
interface VNTemplateVariable {
  name: string;
  type: "actor" | "location" | "world" | "item" | "quest" | "state" | "time" | "random";
  description: string;
  fallback: string | null;
}

const VN_TEMPLATE_VARIABLES: VNTemplateVariable[] = [
  { name: "{{char}}", type: "actor", description: "Current character name", fallback: "Unknown", },
  { name: "{{location}}", type: "location", description: "Current location name", fallback: "Unknown", },
  { name: "{{world}}", type: "world", description: "Current world name", fallback: "Unknown", },
  { name: "{{time}}", type: "time", description: "Current time of day", fallback: "day", },
  { name: "{{weather}}", type: "state", description: "Current weather", fallback: "clear", },
  { name: "{{mood}}", type: "state", description: "Current mood", fallback: "neutral", },
  { name: "{{random}}", type: "random", description: "Random value", fallback: "", },
];
```

### 4.2 Template Actions

```typescript
interface VNTemplateAction {
  id: string;
  name: string;
  type: "scene_change" | "character_change" | "effect" | "condition" | "choice";
  parameters: Record<string, unknown>;
}
```

---

## 5. Database Schema

### vn_scenes table

```sql
CREATE TABLE vn_scenes (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  background_asset_id TEXT REFERENCES assets(id),
  background_color TEXT NOT NULL DEFAULT '#000000',
  state JSON NOT NULL DEFAULT '{}',
  conditions JSON NOT NULL DEFAULT '[]',
  effects JSON NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vn_scenes_chat ON vn_scenes(chat_id);
```

### vn_dialogue table

```sql
CREATE TABLE vn_dialogue (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES vn_scenes(id),
  speaker TEXT NOT NULL, -- actor_id
  text TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'dialogue', -- 'narration', 'dialogue', 'inner_thought', 'system'
  emotion TEXT,
  effects JSON NOT NULL DEFAULT '[]',
  next_id TEXT, -- next dialogue id or choice id
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vn_dialogue_scene ON vn_dialogue(scene_id);
```

### vn_choices table

```sql
CREATE TABLE vn_choices (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES vn_scenes(id),
  text TEXT NOT NULL,
  conditions JSON NOT NULL DEFAULT '[]',
  consequences JSON NOT NULL DEFAULT '[]',
  next_scene_id TEXT REFERENCES vn_scenes(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vn_choices_scene ON vn_choices(scene_id);
```

### vn_qa_sessions table

```sql
CREATE TABLE vn_qa_sessions (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  active INTEGER NOT NULL DEFAULT 1,
  score INTEGER NOT NULL DEFAULT 0,
  current_question_id TEXT,
  answer_history JSON NOT NULL DEFAULT '[]',
  consequences_applied JSON NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vn_qa_sessions_chat ON vn_qa_sessions(chat_id);
```

---

## 6. Implementation Notes

### Files to Create

| File                            | Purpose                                  |
| ------------------------------- | ---------------------------------------- |
| `src/vn/types.ts`               | VN type definitions                      |
| `src/vn/scene-manager.ts`       | Scene management and transitions         |
| `src/vn/dialogue-engine.ts`     | Dialogue flow and choice resolution      |
| `src/vn/qa-engine.ts`           | Q&A mode state machine                   |
| `src/vn/generation-pipeline.ts` | Dynamic image and story generation       |
| `src/vn/template-engine.ts`     | Template variable resolution and actions |
| `src/db/schema-vn.ts`           | VN schema types                          |
| `src/routes/vn.ts`              | VN API routes                            |

### Files to Modify

| File                               | Purpose                  |
| ---------------------------------- | ------------------------ |
| `src/chat/service.ts`              | Add VN scene management  |
| `src/routes/chats.ts`              | Add VN endpoints         |
| `src/generation/actor-resolver.ts` | Add VN context injection |

---

## Reference

| Document                                         | Covers                                 |
| ------------------------------------------------ | -------------------------------------- |
| `docs/frontend/chat/visual-novel-mode.md`        | Frontend VN rendering specs            |
| `.plan/epics/epic-visual-novel-mode.md`          | VN epic (dynamic generation, Q&A)      |
| `.plan/tickets/TASK-vn-dynamic-generation.md`    | Dynamic generation task                |
| `.plan/tickets/TASK-vn-qa-mode.md`               | Q&A mode task                          |
| `.plan/tickets/TASK-vn-template-actions.md`      | Template actions task                  |
| `.plan/tickets/TASK-vn-scene-template-system.md` | Scene template system task             |
| `docs/spec/characters.md`                        | Character data for VN portraits        |
| `docs/spec/worlds.md`                            | World/location data for VN backgrounds |
