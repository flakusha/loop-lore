# Provider System

Bridges `llm-serving.md` (backends), `prompt-creation.md` (prompt assembly), and `src/generation/` into concrete provider architecture.

---

## Architecture

Generation request flows through 5 stages:

## Provider Interface — `src/generation/providers/types.ts`

## Provider Config — `src/config/schema.ts`

Env vars: `LOOPLORE_DEFAULT_PROVIDER`, `LOOPLORE_OPENAI_COMPATIBLE_n_BASE_URL/API_KEY/MODEL`, `LOOPLORE_ANTHROPIC_API_KEY`, `LOOPLORE_OLLAMA_BASE_URL`, `LOOPLORE_SD_BASE_URL`.

## Provider Registry — `src/generation/providers/registry.ts`

### BYO API Key Resolution Order

1. `user_api_keys` table for `userId + providerName` → decrypt → use
2. Chat default: `chats.settings.provider` / `chats.settings.model`
3. Actor default: `actors.settings.provider` / `actors.settings.model`
4. Server default: `config.generation.defaultProvider` + `defaultModels`

User API key flow: `POST /api/settings/api-keys` → AES-256-GCM encrypt with `auth.sessionSecret` → store in `user_api_keys` table.

## Built-in Providers

### OpenAI-Compatible — `src/generation/providers/openai-compatible.ts`

Covers: llama.cpp, vLLM, Ollama (OpenAI mode), LM Studio, tabbyAPI, SGLang, OpenRouter, Together AI, Groq, Fireworks AI.
Standard OpenAI request shape with extended llama.cpp fields (reasoning_budget, min_p, top_k, DRY, XTC, dynatemp).

### Anthropic — `src/generation/providers/anthropic.ts`

`POST /v1/messages` with separate `system` field. Supports `thinking` budget.

### Ollama Native — `src/generation/providers/ollama-native.ts`

`POST /api/chat` with line-delimited JSON (not SSE). Used only when `ollamaNative` configured.

### SD/Image Provider

Spec'd in `image-generation.md`. Implements `ImageProvider` for `"generate_image"` step.

## Integration

### Prompt Assembler → Provider

`assistant/prompt-assembler.ts` returns `AssembledPrompt { messages, systemPrompt?, tokenCount, sections }`.
Pipeline receives this, selects provider, calls `complete()` or `stream()`.

### Generation Pipeline — `src/generation/pipeline.ts`

Wires into `cancellation-tracker.ts` and `cancellation-actions.ts` (repetition/policy detection).

### Story GM Wiring

`GameMasterService.llmDecision()` → builds prompt → `runGeneration()` with resolved provider → store as `actor_message` → `acceptResponse()`.

## Error Handling

| Scenario      | Action                                    |
| ------------- | ----------------------------------------- |
| 400           | Fail, no retry                            |
| 401           | Surface "API key invalid"                 |
| 429           | Retry with exponential backoff            |
| 5xx           | Retry up to `retries`, then fail          |
| Timeout       | Abort via signal, partial content if any  |
| SSE disconnect| Try reconnect once, surface partial       |

## Startup Sequence

## References

- `docs/spec/integrations/llm-serving.md` — backend specs
- `docs/frontend/prompt-creation.md` — prompt assembly
- `docs/spec/integrations/image-generation.md` — image provider
- `src/generation/gen-types-options.ts` — `GenerationOptions`, `GenerationMessage`
- `src/generation/gen-types-results.ts` — `GenerationResult`, `GenerationStep`
- `src/generation/cancellation-tracker.ts` — active generation tracking
- `src/generation/cancellation-actions.ts` — streaming chunk processing