# Prompt Creation Logic

## Status

**Spec updated.** A `PromptAssembler` class now exists at `src/assistant/prompt-assembler.ts`.
It is used by `src/generation/generate-route.ts` for server-side prompt assembly.
The generation module (`src/generation/`) is no longer a "control plane only" — it
assembles prompts server-side before sending to the LLM provider.

The story module (`src/story/game-master.ts`) also has a hardcoded prompt
template for RPG turn-taking — see [Existing Prompt Construction](#existing-prompt-construction).

---

## Overview

The system constructs LLM prompts by composing context from multiple sources.
All non-system-author sections are delimited with **nonce-XML** tags for
prompt-injection resistance (see `docs/spec/prompt-injection.md`).

- **Actor identity** — display name, description, personality, scenario
- **System prompt** — configured per actor or per model
- **Character card fields** — `mes_example`, `alternate_greetings`, `post_history_instructions` (SillyTavern V1/V2 import)
- **Lorebook entries** — actor-owned and world-linked, keyword-scanned
- **Memories** — episodic/semantic/procedural, ordered by importance
- **Chat history** — paginated recent messages
- **Story context** — location, NPC state, active quests (story mode only)
- **Image generation** — SD prompt composition for inline images

The result is a `GenerationMessage[]` array passed to the generation module.

---

## Existing Prompt Construction

The only implemented prompt builder is the story GM in
`src/story/game-master.ts` → `llmDecision()` (line 310):

```
You are {actorName}.
Health: {health}/100. Mental state: {mental_state}.
Carrying: {items}.
Location: {location}. Atmosphere: {atmosphere}.
Active quest: "{name}" ({progress}/{target}).
Previous: {lastActor} said/did: "{last.response}"
Respond in character. Use *action descriptions* for narration. Keep response 50-300 words.
```

This is a **hardcoded template**, not a general-purpose assembler.
It reads from `StoryContext` (NPC states, world state, quests, recent turns)
and produces a `GameMasterDecision.turnPrompt` string.

**Future**: This template should be refactored into the general prompt
assembler, with story-specific sections injected conditionally when
`chat.mode = 'story'`.

---

## Design: Prompt Assembly Pipeline

### Input Types

The assembler accepts a `PromptParams` object derived from existing types:

```typescript
import type { GenerationMessage } from "../generation/gen-types-options";

interface PromptParams {
  actorId: string;
  chatId: string;
  modelId: string;
  provider: string; // 'openai' | 'anthropic' | 'local' | ...
  tokenBudget: number; // max context tokens for this model
  includeStoryContext: boolean; // true when chat.mode = 'story'
  detailMode: "immersion" | "basic" | "detailed";
}
```

### Assembly Order

Prompt sections are assembled in a specific order that determines fallback
priority. When token budget is exceeded, sections are dropped **last-to-first**:

| Order | Section               | Source                                                   | Drop priority       |
| ----- | --------------------- | -------------------------------------------------------- | ------------------- |
| 1     | System prompt         | `actors.system_prompt`                                   | Never               |
| 2     | Actor header          | `actors.{display_name,description,personality,scenario}` | Never               |
| 3     | Lorebook entries      | `actor_lore_entries` + `world_lore_entries`              | 3rd                 |
| 4     | Memories              | `actor_memories` (via asset system)                      | 4th                 |
| 5     | Post-history instr.   | `actors.post_history_instructions`                       | 2nd                 |
| 6     | Example/swipe content | `actors.mes_example`                                     | 1st (dropped first) |
| 7     | Chat history          | `messages` (latest N)                                    | Never               |
| 8     | Story context         | `npc_states`, `location_states`, `quests`                | Never (story mode)  |

### Section Details

#### 1. System Prompt

```
{actors.system_prompt}
```

Provider-specific formatting applied here:

- **OpenAI**: messages array with `role: "system"`
- **Anthropic**: `system` field on the API request
- **Local (llama.cpp, etc.)**: prepended as `\n### System:\n{prompt}\n`

#### 2. Actor Header

```text
[Character — {display_name}]
{description}
Personality: {personality}
Scenario: {scenario}
```

All fields nullable — missing fields omitted from output.

#### 3. Lorebook Injection

- Scan latest `scan_depth` messages for keyword matches against loaded lorebook keys
- Sort matches by `insertion_order` (lower = earlier)
- Deduplicate by lorebook entry `id`
- Fill up to `token_budget` characters, prioritizing highest-`priority` entries
- Insert position: `before_char` or `after_char` (relative to actor header)

**Tables** (planned — not yet in migrations):

- `actor_lore_entries` — owned by actor, keyword-triggered
- `world_lore_entries` — linked via `asset_links` to world, context-triggered

#### 4. Memories

- Retrieve actor memories ordered by `importance` descending
- Truncate when adding would exceed remaining token budget
- Each memory as a bullet: `- {memory_content}`
- Memory types (planned): episodic, semantic, procedural

**Storage** (planned): memories as `assets` with `asset_type = 'memory'` and
subtype label, linked to actors via `asset_links`. See `docs/memory-system.md`.

#### 5. Post-History Instructions

```
{actors.post_history_instructions}
```

Appended verbatim. Dropped second in budget trimming.

#### 6. Example / Swipe Content

```
{actors.mes_example}
```

Inserted after actor header, before system prompt. Dropped first in budget
trimming. This is the SillyTavern "example messages" field — multiple
examples separated by `<START>` tags.

#### 7. Chat History

- Latest N messages (configurable, default 8)
- Preserve original order
- Truncate incomplete thoughts (heuristic: no terminal punctuation)
- Each message formatted as `{actor_display_name}: {content}`
- Token stats included when `detailMode = 'detailed'`

#### 8. Story Context (conditional)

Only included when `chat.mode = 'story'` and `includeStoryContext = true`:

```text
Location: {location_name}. Atmosphere: {atmosphere}.
NPCs present: {npc_list}.
Active quest: "{quest_name}" ({progress}/{target}).
```

Reads from `npc_states`, `location_states`, `quests`, `quest_progress`.

### Token Budget Trimming

Total token estimate calculated per section. When over budget, drop in order:

1. Example/swipe content (`mes_example`)
2. Post-history instructions
3. Lower-priority lorebook entries (by `priority` desc)
4. Low-importance memories (by `importance` desc)

System prompt, actor header, and chat history are **never dropped**.

The final prompt must stay under the model's context limit. Per-model limits
configured in `src/config` (planned — not yet implemented):

```yaml
generation:
  providers:
    openai:
      models:
        gpt-4o: { contextLimit: 128000 }
        gpt-4o-mini: { contextLimit: 128000 }
    anthropic:
      models:
        claude-sonnet-4: { contextLimit: 200000 }
        claude-haiku: { contextLimit: 200000 }
    local:
      models:
        llama-3.1-8b: { contextLimit: 8192 }
```

---

## Provider-Specific Prompt Formatting

The assembler produces a `GenerationMessage[]` that the generation module
routes to the correct provider format:

### OpenAI / compatible

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

### Anthropic

```json
{
  "model": "claude-sonnet-4",
  "system": "...",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

### Local (llama.cpp / vLLM / ollama)

Single string with section markers:

```
### System:
{system_prompt}

### Character:
{actor_header}

### Context:
{lorebook + memories}

### Conversation:
{chat_history}
```

---

## Image Generation (SD) Integration

Image generation uses a separate prompt pipeline, not the text prompt
assembler. The SD integration (planned, see `docs/stable-diffusion-cpp.md`)
composes image prompts from:

- **Character appearance**: extracted from `actors.description` +
  `actors.settings` (appearance fields)
- **Scene context**: current location description, atmosphere, time of day
- **Style modifiers**: from world/actor style settings
- **Negative prompt**: configurable per world/actor

The image prompt is sent to `sd-server` via one of three API paths:

- OpenAI-compatible: `POST /v1/images/generations`
- WebUI-compatible: `POST /sdapi/v1/txt2img`
- Native: `POST /sdcpp/v1/img_gen`

Image generation runs as a **multi-step pipeline** tracked by the generation
module's step system (`src/generation/step-pipeline.ts`):

1. Compose image prompt from context
2. Send to SD endpoint
3. Receive image → store as asset
4. Optionally caption image via LLM → attach to message

---

## DB Schema Dependencies

The prompt assembler reads from these tables (all currently in migrations):

| Table             | Fields used                                                                                                                                                             | Migration                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `actors`          | `display_name`, `description`, `personality`, `scenario`, `system_prompt`, `mes_example`, `post_history_instructions`, `alternate_greetings`, `import_spec`, `settings` | `001_init.ts` (types only, some columns not yet in DB) |
| `messages`        | `chat_id`, `actor_id`, `content`, `role`, `created_at`                                                                                                                  | `001_init.ts`                                          |
| `chats`           | `mode`, `world_id`, `current_location_id`                                                                                                                               | `001_init.ts`                                          |
| `worlds`          | `scan_depth`, `token_budget`                                                                                                                                            | `001_init.ts` (types only, columns not yet in DB)      |
| `npc_states`      | `actor_id`, `world_id`, `health`, `mental_state`, `inventory`                                                                                                           | `001_init.ts`                                          |
| `location_states` | `location_id`, `atmosphere`, `npcs_present`                                                                                                                             | `001_init.ts`                                          |
| `quests`          | `name`, `status`, `progress`, `target`                                                                                                                                  | `001_init.ts`                                          |

**Planned tables** (not yet in migrations):

| Table                | Purpose                               |
| -------------------- | ------------------------------------- |
| `actor_lore_entries` | Actor-owned keyword-triggered lore    |
| `world_lore_entries` | World-linked context-triggered lore   |
| `actor_memories`     | Character memories (via asset system) |

---

## Technical Implementation

- **File**: `src/assistant/prompt-assembler.ts` (planned)
- **Function**: `assemblePrompt(params: PromptParams): GenerationMessage[]`
- **Dependencies**:
  - `kysely` for DB queries (actors, messages, lore_entries, memories)
  - `src/db/enums` for enum values
  - `src/config` for token limits per model/provider
  - `src/generation/types.ts` for `GenerationMessage`, `GenerationOptions`
- **Error handling**:
  - Token budget overflow → drop sections per trimming hierarchy, log warning
  - Missing `actor_id` → fallback to placeholder, continue
  - DB query failure → return minimal prompt with system + user message only

---

## Configuration

**Planned config structure** (not yet in `src/config/schema.ts`):

```yaml
generation:
  defaultContextLength: 8192
  prompt:
    historyLength: 8 # recent messages to include
    memoryBudget: 1024 # tokens reserved for memories
    loreBudget: 2048 # tokens reserved for lorebook entries
    exampleBudget: 512 # tokens reserved for mes_example
  providers:
    openai:
      apiKey: "${OPENAI_API_KEY}"
      baseUrl: "https://api.openai.com/v1"
      models:
        gpt-4o: { contextLimit: 128000, maxOutput: 16384 }
    anthropic:
      apiKey: "${ANTHROPIC_API_KEY}"
      models:
        claude-sonnet-4: { contextLimit: 200000, maxOutput: 8192 }
    local:
      baseUrl: "http://localhost:11434"
      models:
        llama-3.1-8b: { contextLimit: 8192, maxOutput: 2048 }
  sd:
    enabled: false
    baseUrl: "http://localhost:8080"
    defaultSampler: "euler_a"
    defaultSteps: 20
    defaultCfgScale: 7.0
```

---

## Usage Flow

1. **Receive generation request** — `GenerationOptions` from frontend or story GM
2. **Fetch actor data** — query `actors` by `actor_id`
3. **Load lorebooks** — query `actor_lore_entries` + `world_lore_entries` via `asset_links`
4. **Scan recent chat** — retrieve latest N messages, extract keywords for lorebook matching
5. **Assemble sections** — build each section string, respect ordering and truncation
6. **Apply token budget** — estimate tokens per section, trim lowest-priority sections
7. **Format for provider** — convert to `GenerationMessage[]` with provider-specific structure
8. **Return** — pass to generation module which dispatches to LLM provider

---

## Extensibility

- **New memory types** — add enum values, handle in memories section
- **Custom injection positions** — extend lorebook position options
- **Dynamic token budgets** — adjust per-model at runtime from provider API headers
- **New providers** — add formatter in provider-specific step, new config section
- **Prompt templates** — user-configurable prompt templates per actor (override defaults)
- **Multi-turn story** — extend story context section for multi-actor turn sequences

---

## Related Docs

- `docs/memory-system.md` — three-tier memory architecture
- `docs/actors.md` — actor data model, character card imports, lorebooks
- `docs/stable-diffusion-cpp.md` — SD integration API reference
- `docs/frontend/chat/generation.md` — generation control flow, streaming, error handling
- `docs/implementation.md` — tech stack overview
- `src/generation/gen-types-options.ts` — `GenerationOptions`, `GenerationMessage` types
- `src/story/game-master.ts` — existing RPG prompt construction (lines 310-364)
