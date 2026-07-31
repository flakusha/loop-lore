# EPIC: AUX LLM Enrichment Pipeline

**Status:** ⬜ Not Started
**Priority:** P2-B
**Effort:** Medium
**Type:** Feature Epic

## Summary

Lightweight AUX LLM pipeline for real-time enrichment of chat messages.
Small models (~5s round-trip on consumer GPU/CPU) run focused classification
and extraction tasks in parallel with or before main generation.

The AUX LLM is NOT a replacement for the main model — it's a fast, cheap
pre-processor that enriches context before the main generation call.

## Design Principles

| Principle    | Value                      | Rationale                                              |
| ------------ | -------------------------- | ------------------------------------------------------ |
| **Fast**     | <5s round-trip             | Consumer GPU/CPU, no user-visible delay                |
| **Cheap**    | Small model, small context | ~500-1000 tokens per call                              |
| **Focused**  | One task per call          | Classification, extraction, or update — not generation |
| **Optional** | Graceful degradation       | Any failure → skip enrichment, proceed without         |
| **Parallel** | Runs alongside main gen    | Doesn't block message flow                             |

## Architecture

```
User message
  ↓
┌─────────────────────────────────────────────┐
│ AUX LLM Pipeline (parallel, <5s)            │
│                                             │
│  ┌─────────────┐  ┌─────────────┐          │
│  │ Transition  │  │   Mood      │          │
│  │ Classifier  │  │  Classifier │          │
│  └──────┬──────┘  └──────┬──────┘          │
│         │                │                  │
│  ┌──────┴──────┐  ┌──────┴──────┐          │
│  │  Memory     │  │ Environment │          │
│  │  Extractor  │  │ Interactor  │          │
│  └──────┬──────┘  └──────┬──────┘          │
│         │                │                  │
│  ┌──────┴──────┐  ┌──────┴──────┐          │
│  │  Personality│  │   GM Tool   │          │
│  │  Check      │  │  Detector   │          │
│  └──────┬──────┘  └──────┬──────┘          │
│         │                │                  │
│         └───────┬────────┘                  │
│                 ↓                           │
│         Enrichment Bag                      │
│    { transitions, mood, memory,             │
│      environment, personality, tools }      │
└─────────────────────────────────────────────┘
  ↓
Main Generation (with enriched context)
  ↓
Response + Side Effects (DB writes for enrichment results)
```

## Enrichment Tasks

### 1. Transition Detection

**Goal**: Detect location changes, scene breaks, context cuts
**When**: Every user message
**Output**: `{ isTransition, type, locationHint, confidence }`
**Ticket**: `TASK-transition-aux-llm-fallback.md`

### 2. Mood Classification

**Goal**: Detect mood-affecting events in messages
**When**: Every user message in story/group mode
**Output**: `{ moodShift: number, trigger: MoodTrigger, reason: string }`
**Integration**: Updates `character_mood` table, affects expression modifiers
**Ticket**: `TASK-character-mood-happiness.md`

### 3. Memory Extraction

**Goal**: Identify memorable moments worth persisting
**When**: After each assistant response
**Output**: `{ memories: [{ content, importance, keywords, scope }] }`
**Integration**: Stores to `actor_memories` table
**Ticket**: `TASK-wire-memory-promotion-pipeline.md`

### 4. Environment Interaction Detection

**Goal**: Detect when user interacts with environment objects/NPCs
**When**: Every user message
**Output**: `{ interacts: [{ type, target, action, confidence }] }`
**Types**: `object_use`, `npc_talk`, `npc_trade`, `npc_attack`, `examine`, `pickup`
**Integration**: Feeds into world state, triggers events

### 5. Personality Drift Check

**Goal**: Detect if AI character responses drift from defined personality
**When**: After each assistant response (opt-in per character)
**Output**: `{ drift: number, axis: string, suggestion: string }`
**Integration**: Logs drift events, optionally triggers personality correction
**Note**: Opt-in only — characters must have `personality_check: true`

### 6. GM Tool Detection

**Goal**: Detect when user wants GM to execute a tool/action
**When**: Every user message in GM-mode chats
**Output**: `{ toolCall: { name, params, confidence } }`
**Integration**: Triggers GM tool execution pipeline
**Ticket**: `TASK-assistant-command-execution-intent-detection.md`

### 7. Scene Context Extraction

**Goal**: Extract current scene context for prompt enrichment
**When**: Before each main generation call
**Output**: `{ location, weather, timeOfDay, participants, activeQuests }`
**Integration**: Injected into system prompt as scene context

### 8. Emotion Avatar Selection

**Goal**: Detect emotion changes in responses and trigger avatar updates
**When**: After each assistant response
**Output**: `{ emotion, intensity, confidence, changeFromPrevious }`
**Integration**: Calls `AvatarService.selectAvatar()` when emotion changes
**Ticket**: `TASK-aux-emotion-avatar.md`

## Shared Infrastructure

All enrichment tasks share:

```typescript
interface AuxEnrichmentConfig {
  /** Enable/disable individual enrichment tasks */
  enabled: Record<EnrichmentTask, boolean>;
  /** Model to use (defaults to auxiliary role) */
  modelOverride?: string;
  /** Timeout per task in ms */
  timeoutMs: number; // default: 2000
  /** Max tokens per task response */
  maxTokens: number; // default: 100
  /** Temperature for classification tasks */
  temperature: number; // default: 0.0
}

type EnrichmentTask =
  | "transition"
  | "mood"
  | "memory"
  | "environment"
  | "personality"
  | "gm_tool"
  | "scene_context"
  | "emotion_avatar";
```

### Shared Runner

```typescript
async function runEnrichment(
  task: EnrichmentTask,
  messages: ChatMessage[],
  config: AuxEnrichmentConfig,
  db: Kysely<DB>,
): Promise<EnrichmentResult | null> {
  if (!config.enabled[task]) { return null; }

  const auxRole = await resolveModelRole("auxiliary", config, db,);
  if (!auxRole.provider || !auxRole.model) { return null; }

  const provider = getProvider(auxRole.provider,);
  if (!provider) { return null; }

  const prompt = ENRICHMENT_PROMPTS[task];
  const context = buildMinimalContext(messages, task,);

  try {
    const response = await withTimeout(
      provider.complete({
        model: config.modelOverride ?? auxRole.model,
        messages: [...context, { role: "user", content: context, },],
        params: { temperature: config.temperature, maxTokens: config.maxTokens, },
      },),
      config.timeoutMs,
    );
    if (!response) { return null; }

    return parseEnrichmentResponse(task, response.content,);
  } catch {
    return null; // Graceful degradation
  }
}
```

### Prompt Templates

Each task has a focused system prompt:

```typescript
const ENRICHMENT_PROMPTS: Record<EnrichmentTask, string> = {
  transition: `You are a transition detector...`, // Already designed
  mood: `You are a mood classifier. Analyze the user message for mood-affecting events.
Reply with ONLY JSON: { "moodShift": -20 to +20, "trigger": "positive_event|negative_event|...", "reason": "brief explanation" }`,
  memory: `You are a memory extractor. Identify moments worth remembering.
Reply with ONLY JSON: { "memories": [{ "content": "what happened", "importance": 1-10, "keywords": ["tag1"], "scope": "character|world|assistant" }] }`,
  environment: `You are an environment interaction detector. Identify when the user interacts with objects or NPCs.
Reply with ONLY JSON: { "interacts": [{ "type": "object_use|npc_talk|...", "target": "name", "action": "description", "confidence": 0.0-1.0 }] }`,
  personality: `You are a personality drift checker. Compare the character's response to their defined traits.
Reply with ONLY JSON: { "drift": 0.0-1.0, "axis": "which trait drifted", "suggestion": "how to correct" }`,
  gm_tool: `You are a GM tool detector. Identify when the user requests a GM action.
Reply with ONLY JSON: { "toolCall": { "name": "tool_name", "params": {}, "confidence": 0.0-1.0 } }`,
  scene_context: `You are a scene context extractor. Summarize the current scene state.
Reply with ONLY JSON: { "location": "name", "weather": "condition", "timeOfDay": "morning|...", "participants": ["name1"], "activeQuests": ["quest1"] }`,
  emotion_avatar:
    `You are an emotion classifier for a character's expression. Analyze the response to determine the character's emotion.
Reply with ONLY JSON: { "emotion": "happy|sad|angry|fearful|surprised|disgusted|neutral|flirtatious|confused|determined|exhausted|excited", "intensity": 0.0-1.0, "confidence": 0.0-1.0, "changeFromPrevious": true/false }`,
};
```

## Integration Points

### Systems This Epic Depends On

| System            | What It Provides       | How Used        |
| ----------------- | ---------------------- | --------------- |
| Provider Registry | AUX model provider     | Model access    |
| Config Schema     | `auxiliary` model role | Model selection |
| Chat Types        | Message types          | Input context   |

### Systems That Depend On This Epic

| System           | What It Consumes          | How Used                  |
| ---------------- | ------------------------- | ------------------------- |
| Chat Transitions | Transition classification | Location change detection |
| Character Mood   | Mood classification       | Mood state updates        |
| Memory System    | Memory extraction         | Memory creation           |
| World/Location   | Environment interactions  | World state updates       |
| Character Core   | Personality drift         | Personality enforcement   |
| Assistant/GM     | Tool detection            | Tool execution            |
| Chat Generation  | Scene context             | Prompt enrichment         |
| Avatar System    | Emotion classification    | Avatar selection          |

### Cross-System Events

| Event                        | Direction | Purpose                    |
| ---------------------------- | --------- | -------------------------- |
| `aux.transition_detected`    | emits     | Location change detected   |
| `aux.mood_shifted`           | emits     | Character mood changed     |
| `aux.memory_extracted`       | emits     | New memory created         |
| `aux.environment_interacted` | emits     | Object/NPC interaction     |
| `aux.personality_drifted`    | emits     | Personality drift detected |
| `aux.gm_tool_detected`       | emits     | GM tool call detected      |
| `aux.scene_extracted`        | emits     | Scene context available    |
| `aux.emotion_detected`       | emits     | Character emotion changed  |

## Tasks

- `TASK-transition-aux-llm-fallback.md` — transition detection (Phase 1)
- `TASK-aux-mood-classification.md` — mood classification (Phase 1)
- `TASK-aux-memory-extraction.md` — memory extraction (Phase 1)
- `TASK-aux-environment-interaction.md` — environment interaction (Phase 2)
- `TASK-aux-personality-drift.md` — personality drift check (Phase 2)
- `TASK-aux-gm-tool-detection.md` — GM tool detection (Phase 2)
- `TASK-aux-scene-context.md` — scene context extraction (Phase 2)
- `TASK-aux-emotion-avatar.md` — emotion avatar selection (Phase 2)

## Files to Create

- `src/aux-pipeline/index.ts` — pipeline orchestrator
- `src/aux-pipeline/types.ts` — shared types
- `src/aux-pipeline/runner.ts` — shared runner with timeout
- `src/aux-pipeline/prompts.ts` — prompt templates
- `src/aux-pipeline/tasks/transition.ts` — transition classifier
- `src/aux-pipeline/tasks/mood.ts` — mood classifier
- `src/aux-pipeline/tasks/memory.ts` — memory extractor
- `src/aux-pipeline/tasks/environment.ts` — environment interactor
- `src/aux-pipeline/tasks/personality.ts` — personality checker
- `src/aux-pipeline/tasks/gm-tool.ts` — GM tool detector
- `src/aux-pipeline/tasks/scene-context.ts` — scene extractor

## Acceptance Criteria

- [ ] AUX pipeline orchestrator runs tasks in parallel
- [ ] Each task has focused system prompt + JSON response parsing
- [ ] 2s timeout per task with graceful degradation
- [ ] Shared runner with provider resolution
- [ ] Enrichment results injected into main generation context
- [ ] Side effects (DB writes) happen async after main response
- [ ] All existing tests still pass
- [ ] Pipeline configurable per chat (enable/disable individual tasks)

## Verification

```bash
bun run check
bun test src/aux-pipeline/
```
