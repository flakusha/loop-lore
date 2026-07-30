# EPIC: Provider & Plugin Ecosystem

**Status:** 🟡 Partial (openai-compatible complete; native providers deferred)
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** providers, anthropic, ollama, bedrock, plugin-management, byok

## Summary

Expand the LLM provider ecosystem beyond OpenAI-compatible, and build the
plugin management API for installing, listing, enabling, and disabling plugins.
Includes provider-specific adapters (Anthropic, Ollama, Bedrock), plugin
override system, and security sandboxing.

Split from Generation Foundation (Epic 10) — core tool-call loop, failover,
and SSE reconnect are complete. This epic covers the _breadth_ of providers
and the plugin lifecycle.

## Current State

| Area                         | File                                            | State                                              |
| ---------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| OpenAI-compatible provider   | `src/generation/providers/openai-compatible.ts` | ✅ Built                                           |
| ComfyUI client (image)       | `src/generation/providers/comfyui.ts`           | ✅ Built                                           |
| Provider registry + failover | `src/generation/providers/registry.ts`          | ✅ Built                                           |
| Circuit breaker              | `src/generation/providers/circuit-breaker.ts`   | ✅ Built                                           |
| `LLMProvider` interface      | `src/generation/providers/types.ts`             | ✅ Built                                           |
| `ProviderCapabilities.type`  | `src/generation/providers/types.ts`             | ✅ Includes `"anthropic" \| "ollama" \| "bedrock"` |
| Anthropic adapter            | —                                               | ⏸ Deferred (closed FEAT-076, uses openai-compatible shim) |
| Ollama adapter               | —                                               | ⏸ Deferred (closed FEAT-082, uses openai-compatible shim) |
| Bedrock adapter              | —                                               | ⏸ Deferred (uses openai-compatible shim) |
| Plugin management API        | —                                               | ❌ Not started                                     |
| Plugin override system       | —                                               | ❌ Not started                                     |
| Plugin security sandboxing   | —                                               | ❌ Not started                                     |

## Design

### Provider Adapters

Each provider implements `LLMProvider`. The registry resolves by
`ProviderCapabilities.type` and delegates to the correct adapter.

```typescript
// Anthropic adapter — Messages API
class AnthropicProvider implements LLMProvider {
  readonly capabilities = {
    type: "anthropic" as const,
    label: "Anthropic",
    text: true,
    image: false,
    embeddings: false,
    streaming: true,
    tools: true,
    thinking: true, // extended thinking
  };
}

// Ollama adapter — /api/chat
class OllamaProvider implements LLMProvider {
  readonly capabilities = {
    type: "ollama" as const,
    label: "Ollama (Local)",
    text: true,
    image: false,
    embeddings: true,
    streaming: true,
    tools: true,
    thinking: false,
  };
}

// Bedrock adapter — ConverseStream API
class BedrockProvider implements LLMProvider {
  readonly capabilities = {
    type: "bedrock" as const,
    label: "AWS Bedrock",
    text: true,
    image: false,
    embeddings: false,
    streaming: true,
    tools: true,
    thinking: false,
  };
}
```

### Plugin Management API

| Endpoint                     | Method  | Description            |
| ---------------------------- | ------- | ---------------------- |
| `/api/plugins`               | GET     | List installed plugins |
| `/api/plugins/:id`           | GET     | Get plugin details     |
| `/api/plugins/:id/enable`    | POST    | Enable plugin          |
| `/api/plugins/:id/disable`   | POST    | Disable plugin         |
| `/api/plugins/install`       | POST    | Install from URL/path  |
| `/api/plugins/:id/uninstall` | POST    | Uninstall plugin       |
| `/api/plugins/:id/config`    | GET/PUT | Plugin configuration   |

### Plugin Override System

Plugins can override provider behavior:

```typescript
interface PluginOverride {
  pluginId: string;
  target: "provider" | "route" | "middleware";
  hook: string;
  priority: number;
  handler: (...args: unknown[]) => unknown;
}
```

### Security Sandboxing

- Plugins run in isolated context
- No direct DB access (use provided API)
- Filesystem restricted to plugin directory
- Network access controlled by config
- Resource limits (CPU, memory, time)

## Tasks

### Phase 1: Provider Adapters (MVP)

- [ ] Anthropic adapter (`src/generation/providers/anthropic.ts`)
  - Messages API with streaming
  - Extended thinking support
  - Tool calling
  - Model listing
- [ ] Ollama adapter (`src/generation/providers/ollama.ts`)
  - `/api/chat` with streaming
  - Local model listing via `/api/tags`
  - Embeddings via `/api/embeddings`
  - Auto-detect running Ollama instance
- [ ] Bedrock adapter (`src/generation/providers/bedrock.ts`)
  - ConverseStream API
  - IAM auth via SDK
  - Model listing from Bedrock
- [ ] Provider config schema additions
- [ ] Unit tests for each adapter

### Phase 2: Plugin Management API

- [ ] Plugin manifest schema (`plugin.json`)
- [ ] Plugin loader (`src/plugins/loader.ts`)
- [ ] Plugin registry (`src/plugins/registry.ts`)
- [ ] CRUD routes (`src/routes/plugins.ts`)
- [ ] Plugin config store (DB table)
- [ ] Unit tests for loader + registry

### Phase 3: Plugin Overrides & Sandboxing

- [ ] Override registration system
- [ ] Hook execution pipeline
- [ ] Sandbox context isolation
- [ ] Resource limit enforcement
- [ ] Integration tests

## Files (proposed)

- `src/generation/providers/anthropic.ts` — Anthropic adapter
- `src/generation/providers/ollama.ts` — Ollama adapter
- `src/generation/providers/bedrock.ts` — Bedrock adapter
- `src/plugins/loader.ts` — Plugin discovery + loading
- `src/plugins/registry.ts` — Plugin registry + lifecycle
- `src/plugins/sandbox.ts` — Plugin isolation
- `src/routes/plugins.ts` — Plugin management API
- `src/db/schema-plugins.ts` — Plugin config table

## Dependencies

- Existing: `src/generation/providers/types.ts` (LLMProvider interface)
- Existing: `src/generation/providers/registry.ts` (provider registration)
- Existing: `src/plugins/` (plugin skeleton)
- External: `@anthropic-ai/sdk` (Anthropic)
- External: `ollama` npm package or raw HTTP
- External: `@aws-sdk/client-bedrock-runtime` (Bedrock)

## References

- `docs/spec/provider-system.md` — provider architecture spec
- `docs/spec/plugin-system.md` — plugin system spec
- `src/generation/providers/types.ts` — LLMProvider interface

## Linked Tasks

- FEAT-provider-plugin-ecosystem.md
- TASK-plugin-system.md
- TASK-plugin-management-api.md
- TASK-plugin-discovery-loading.md
- TASK-plugin-hook-system.md
- TASK-plugin-override-system.md
- TASK-plugin-security-sandboxing.md
