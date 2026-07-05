# LLM/SD Integration Implementation Plan

Current state: Config schema, provider client (OpenAI-compatible), registry,
prompt assembler (8-section pipeline), generation route (stream + non-stream),
GameMaster LLM wiring — all built. No Anthropic/Ollama providers, no BYO API
keys, no SD/image generation yet.

**Tests pass. TypeScript compiles clean.**

---

## ✅ Done

| Area | Key Files |
|------|-----------|
| Config schema (LLM/SD providers, BYO key, model limits) | `src/config/schema.ts` + `load.ts` |
| Provider interface + error types | `src/generation/providers/types.ts` |
| Provider registry + resolveProvider | `src/generation/providers/registry.ts` |
| OpenAI-compatible provider (stream + non-stream, retry, health, models) | `src/generation/providers/openai-compatible.ts` |
| llama.cpp extended params passthrough (minP, DRY, XTC, dynatemp, etc.) | `src/generation/providers/openai-compatible.ts` |
| Prompt assembler (system→actor→lore→memories→postHistory→examples→history→story) | `src/assistant/prompt-assembler.ts` |
| Token budget enforcement (drop examples→postHistory→lore→memories) | `src/assistant/prompt-assembler.ts` |
| Lore/memory DB table types (actor_lore_entries, world_lore_entries, actor_memories) | `src/db/schema-story.ts` |
| Generation route (POST /api/generation/generate, SSE streaming + non-streaming) | `src/generation/generate-route.ts` |
| GameMasterService wired to LLM via `generateText` callback + PromptAssembler | `src/story/game-master.ts` |
| Hardcoded prompt fallback when LLM call fails | `src/story/game-master.ts` |
| Provider system spec doc | `docs/spec/provider-system.md` |
| All provider types/classes exported from barrel | `src/generation/index.ts` |

---

## ❌ In Progress / Pending

| Area | Gap | Priority |
|------|-----|----------|
| **BYO API key** | `user_api_keys` table, AES-256-GCM encryption, per-user provider routing in resolveProvider | Medium |
| **Anthropic provider** | Native Anthropic API (not OpenAI-compatible) — system field, message blocks, thinking blocks | Low |
| **Ollama native provider** | Ollama native API (not OpenAI-compatible) — `/api/generate`, `/api/chat` | Low |
| **Image generation / SD** | Provider interface + SD-cpp/WebUI provider + step pipeline + asset attachment | Future |
| **Generation tests** | `generate-route.ts` has no tests yet | High |
| **GameMaster tests** | Constructor changed (needs `generateText` param) — existing tests may need update | High |

---

## 📋 Implementation Order

### 1. BYO API Key (Medium)
- Add `user_api_keys` table to migration + schema types
- AES-256-GCM encryption (use existing `src/frontend/browser.ts` crypto patterns?)
- Add `resolveProvider` user key lookup step (step 1 in resolution order)
- Test: encrypt/decrypt cycle, routing

### 2. Anthropic Provider (Low)
- Implement `LLMProvider` interface for native Anthropic API
- System prompt as `system` field (not messages array)
- Message blocks (JSON content blocks, not plain text)
- Thinking/reasoning content
- Register in `initializeProviders` when `config.generation.providers.anthropic` present

### 3. Ollama Native Provider (Low)
- `POST /api/chat` for chat completion
- Tool calling support
- Model list: `GET /api/tags`
- Register in `initializeProviders` when `config.generation.providers.ollamaNative` present

### 4. Tests (High)
- `generate-route.ts` tests: validate → prompt assembly → provider → DB insert → response
- Mock provider for deterministic testing
- GameMaster tests: verify `generateText` callback is called with correct messages

### 5. SD / Image Generation (Future)
- Image provider interface (extend `LLMProvider` or separate interface)
- SD-cpp native API (`/sdcpp/v1/img_gen`)
- WebUI compatible API (`/sdapi/v1/txt2img`)
- Step pipeline: generate_text → generate_image → caption → attach_asset
- See `docs/spec/integrations/image-generation.md`

---

## Architecture Summary

```
POST /api/generation/generate
  ├─ resolveProvider()     → provider + model from config/user key
  ├─ PromptAssembler       → 8-section GenerationMessage[]
  ├─ startGenerationTracking → attemptId + abortSignal
  ├─ provider.complete() | provider.stream()
  │   ├─ OpenAI-compatible → cover llm.cpp, vLLM, Ollama, LM Studio, tabbyAPI, SGLang, OpenRouter
  │   ├─ Anthropic (TODO)  → native API with system field
  │   └─ Ollama (TODO)     → native /api/chat
  ├─ processStreamingChunk → repetition + policy detection (stream only)
  ├─ db.messages.insert    → store result
  ├─ completeGeneration    → update attempt stats
  └─ SSE | JSON response

GameMasterService
  └─ generateText callback → decoupled from generation modules
     └─ Provider client     → substitute by caller
```