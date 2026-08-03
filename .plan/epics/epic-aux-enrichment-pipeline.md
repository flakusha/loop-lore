# EPIC: AUX LLM Enrichment Pipeline

**Status:** 🟡 Partial — transition detection + memory extraction implemented; shared runner missing, wiring gaps open (2026-08-01 review)
**Priority:** P2-B
**Effort:** Medium
**Type:** Feature Epic

## Summary

Lightweight AUX LLM pipeline for real-time enrichment of chat messages.
Small models (~5s round-trip on consumer GPU/CPU) run focused classification
and extraction tasks in parallel with or before main generation.

The AUX LLM is NOT a replacement for the main model — it's a fast, cheap
pre-processor that enriches context before the main generation call.

## Implementation State (2026-08-01 review)

| Enrichment task                                     | Design    | Code state        | Location                                                          | Notes                                                                                                                                                  |
| --------------------------------------------------- | --------- | ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Transition detection                                | ✅        | ✅ Implemented    | `src/chat/transition-classifier.ts`                               | Regex-first + AUX fallback; 2s timeout, temp 0.0, maxTokens 100. Wired `routes/messages.ts:851` (awaited → +2s worst-case on message POST)             |
| Intent classification                               | ⚠️ partial | ⚠️ Ad-hoc          | `src/generation/auto-gen.ts:74` `classifyIntent`                  | AUX wired, but **no timeout** (blocks every message pre-generation), no apiKey, temp 0.1; result only adjusts maxTokens                                |
| Memory extraction                                   | ⚠️         | ⚠️ Wrong role      | `src/memory/extraction.ts`                                        | Works, but called with MAIN provider + literal `model: "default"` via `as never` cast — fails on most OpenAI-compatible servers; not on auxiliary role |
| Mood classification                                 | ⚠️         | ❌ No LLM         | `src/generation/hooks/mood-hook.ts`                               | Keyword-based only; doc header claims LLM (stale); results unconsumed                                                                                  |
| Emotion avatar selection                            | ⚠️         | ❌ No LLM         | `src/generation/hooks/emotion-hook.ts`, `src/assistant/intent.ts` | Keyword-based; `detectAvatarChangeIntent` dead code; avatar selection manual-only via `POST /api/actors/:actorId/avatars/select`                       |
| Environment / Personality / GM tool / Scene context | ✅        | ❌ Not started    | —                                                                 | Design only                                                                                                                                            |
| Shared runner `src/aux-pipeline/`                   | —         | ❌ Does not exist | —                                                                 | 3 hand-rolled AUX call variants with divergent constraints                                                                                             |

## Review Findings → Gaps (2026-08-01)

Audit of `src/` produced these actionable gaps. Severity: 🔴 high / 🟡 medium / 🟢 low.

1. 🔴 **No shared AUX runner.** Three hand-rolled call sites diverge: transition-classifier (2s timeout, temp 0.0, maxTokens 100, no apiKey), `classifyIntent` (no timeout, temp 0.1, no apiKey), memory extraction (no timeout, main role, `model: "default"`). No single policy for timeout/temperature/tokens/JSON-mode.
2. 🔴 **AUX path bypasses `resolveProvider`.** `resolveModelRole` returns provider/model only — no BYO apiKey, no chat/actor overrides. BYO-key users' AUX calls fall back to provider instance key or fail silently (intent/transition classification silently degrades for exactly those users).
3. 🔴 **`classifyIntent` blocks message flow.** Awaited at `auto-gen.ts:300` before the main LLM call (both streaming and non-streaming) with no timeout → a hung AUX provider delays every user message by the full provider timeout.
4. 🔴 **`ModelRole.Moderation` + `ModelRole.Captioning` are dead roles.** Admin-manageable (`model_role_overrides` table, `VALID_ROLES`), but no code path ever calls `resolveModelRole("moderation"|"captioning")`. `caption-route.ts` resolves the MAIN role.
5. 🔴 **ModerationHook suppresses whole responses on substring match.** `moderation-hook.ts:44` — `includes()` on {hate, violence, threat, abuse, harass} → `suppressContent: true` → entire generation discarded in `auto-gen.ts:431`, no severity, no audit trail (NsfwHook does `recordAudit`; ModerationHook does not).
6. 🔴 **Emotion/mood hook `data` is a dead end.** `hookResult.events` consumed only for the block-reason string; `data.dominantEmotion`/`dominantMood` never read → no avatar change, no `character_mood` write, no frontend event.
7. 🟡 **Dead code:** `detectIntent` and `detectAvatarChangeIntent` (`src/assistant/intent.ts`) have zero consumers. Two disjoint intent vocabularies exist (`assistant` regex vs `auto-gen` LLM).
8. 🟡 **AUX calls invisible to telemetry** — no `generation_attempts` row, no token usage, no telemetry event for intent/transition calls.
9. 🟢 `ExtractionOpts.modelId` dead field; `db` passed twice at `generate-route.ts:524`.

## Next Milestones (prioritized)

### M1 — Shared AUX runner (blocks everything else)

- Create `src/aux-pipeline/` with `types.ts`, `prompts.ts`, `runner.ts`.
- `callAux(role, prompt, { timeoutMs = 2000, temperature = 0.0, maxTokens = 100 })` — one policy for all AUX tasks.
- Resolve apiKey through `resolveProvider` (user BYO key → chat → actor → server default); pass `apiKey` on every AUX `provider.complete()`.
- Migrate: transition-classifier → runner; `classifyIntent` → runner (adds the missing 2s timeout); memory extraction → runner on auxiliary role.
- Add per-task telemetry recording (token usage + latency).
- **Exit:** all AUX calls ≤2s, BYO-key parity with main path, telemetry visible.

### M2 — Fix memory extraction

- Pass real model (`resolved.resolvedModel`), drop `as never` cast, remove dead `modelId`/duplicate `db` param, move call off the main provider.

### M3 — Resolve dead model roles

- Either wire `ModelRole.Moderation` into ModerationHook/NSFW moderation pipeline (LLM moderation), and `ModelRole.Captioning` into `caption-route.ts`, or remove both from `VALID_ROLES` and the admin UI. Dead admin surface misleads users.

### M4 — Consume emotion/mood hook events

- Emit `avatar.emotion_changed` + `character_mood` writes from hook `data`, or remove the hooks. Wire `TASK-aux-emotion-avatar` / `TASK-aux-mood-classification`; kill `detectAvatarChangeIntent` (or fold into runner as fast path).

### M5 — ModerationHook safety

- Tokenized matching (not substring), severity scoring, `recordAudit` trail, non-destructive suppression (store flagged message, don't drop it).

### M6 — Telemetry

- Record AUX calls in telemetry (event type, model, provider, tokens, latency, success/failure).

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

- ✅ `TASK-transition-aux-llm-fallback.md` — transition detection (Phase 1) — **done**, `src/chat/transition-classifier.ts`; follow-ups: shared-runner migration, apiKey
- 🟡 `TASK-aux-mood-classification.md` — mood classification (Phase 1) — partial: keyword `MoodHook` exists, no LLM, events unconsumed
- 🟡 `TASK-aux-memory-extraction.md` — memory extraction (Phase 1) — partial: implemented on MAIN role with `model: "default"` bug
- `TASK-aux-environment-interaction.md` — environment interaction (Phase 2) — not started
- `TASK-aux-personality-drift.md` — personality drift check (Phase 2) — not started
- `TASK-aux-gm-tool-detection.md` — GM tool detection (Phase 2) — not started
- `TASK-aux-scene-context.md` — scene context extraction (Phase 2) — not started
- 🟡 `TASK-aux-emotion-avatar.md` — emotion avatar selection (Phase 2) — partial: avatar infra exists, no LLM, hook events dropped

## Files to Create

- `src/aux-pipeline/index.ts` — pipeline orchestrator
- `src/aux-pipeline/types.ts` — shared types
- `src/aux-pipeline/runner.ts` — shared runner with timeout (M1 — not yet created; exists as hand-rolled `withTimeout` in `src/chat/transition-classifier.ts`)
- `src/aux-pipeline/prompts.ts` — prompt templates
- `src/aux-pipeline/tasks/mood.ts` — mood classifier (replace keyword `mood-hook.ts`)
- `src/aux-pipeline/tasks/memory.ts` — memory extractor (migrate from `src/memory/extraction.ts`)
- `src/aux-pipeline/tasks/environment.ts` — environment interactor
- `src/aux-pipeline/tasks/personality.ts` — personality checker
- `src/aux-pipeline/tasks/gm-tool.ts` — GM tool detector
- `src/aux-pipeline/tasks/scene-context.ts` — scene extractor

## Already Implemented (outside aux-pipeline)

- `src/chat/transition-classifier.ts` — transition classifier (regex-first + AUX LLM fallback, 2s timeout). Migrate to `aux-pipeline/tasks/transition.ts` in M1.
- `src/generation/auto-gen.ts` `classifyIntent` — intent classification (ad-hoc, no timeout). Migrate to `aux-pipeline/tasks/intent.ts` in M1.

## Acceptance Criteria

- [ ] AUX pipeline orchestrator runs tasks in parallel
- [ ] Each task has focused system prompt + JSON response parsing
- [ ] 2s timeout per task with graceful degradation
- [ ] Shared runner with provider resolution
- [ ] **AUX calls resolve apiKey via `resolveProvider` (BYO key parity with main path)** — added 2026-08-01 review
- [ ] **No AUX call blocks message flow (all ≤2s, none awaited pre-generation without timeout)** — added 2026-08-01 review
- [ ] **AUX calls recorded in telemetry (tokens, latency, success/failure)** — added 2026-08-01 review
- [ ] Enrichment results injected into main generation context
- [ ] Side effects (DB writes) happen async after main response
- [ ] All existing tests still pass
- [ ] Pipeline configurable per chat (enable/disable individual tasks)

## Verification

```bash
bun run check
bun test src/aux-pipeline/
```
