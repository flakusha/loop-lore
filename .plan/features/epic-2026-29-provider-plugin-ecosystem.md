# Epic 2026-29: Provider & Plugin Ecosystem

**Status:** Not Started (P2)
**Priority:** Medium
**Source:** docs/spec/provider-system.md, docs/spec/plugin-system.md

## Summary

Multi-provider LLM support (Anthropic, Ollama, Bedrock), plugin installation/management, and provider model metadata.

## Linked Tasks

| Task          | Title                                               | Priority | Status      |
| ------------- | --------------------------------------------------- | -------- | ----------- |
| FEAT-2026-010 | Anthropic/Ollama/Bedrock providers                  | Medium   | Not Started |
| FEAT-2026-011 | Plugin management API (install/list/enable/disable) | Medium   | Not Started |
| FEAT-2026-034 | Display provider model metadata in admin models tab | Low      | Not Started |

## Provider Architecture

### Current State

- Only OpenAI-compatible provider exists
- Single API key configuration

### Future State

- Multiple provider adapters (OpenAI, Anthropic, Ollama, Bedrock)
- Per-provider configuration
- Model metadata caching
- Health check endpoints

## Implementation Phases

### Phase 1: Provider Abstraction

- [ ] Provider interface (`src/providers/interface.ts`)
- [ ] OpenAI adapter (existing)
- [ ] Anthropic adapter
- [ ] Ollama adapter
- [ ] Bedrock adapter

### Phase 2: Plugin Management

- [ ] Plugin install endpoint
- [ ] Plugin enable/disable endpoints
- [ ] Plugin discovery
- [ ] Admin UI tab

### Phase 3: Model Metadata

- [ ] Provider model list caching
- [ ] Admin UI: models tab
- [ ] Model capability display

## Files

- `src/providers/interface.ts` — Provider interface
- `src/providers/openai.ts` — OpenAI adapter
- `src/providers/anthropic.ts` — Anthropic adapter
- `src/providers/ollama.ts` — Ollama adapter
- `src/providers/bedrock.ts` — Bedrock adapter
- `src/routes/plugins.ts` — Plugin management
- `src/frontend/alpine/admin-plugins.ts` — Admin UI
