# FEAT-byok-local-models: BYOK Local Models

**Status**: open
**Priority**: high
**Labels**: byok, local-models, wasm, inference, llama, browser, offline
**Assignee**:
**Epic**: EPIC-byok-local-models
**Related**: epic-byok-api-keys.md, epic-assistant-generation-extensions.md

---

## Description

Players can download models and WASM modules to run inference locally in the browser, or connect to a local llama.cpp server via tunnel. This enables fully offline, privacy-preserving RPG sessions where the AI never leaves the player's machine. Community hosts can distribute model packs for their instance.

Three inference modes:

1. **Browser WASM** — self-contained, no network, full privacy, slower
2. **Local llama.cpp tunnel** — native speed, full privacy, requires local server
3. **Server default** — existing behavior, best quality, requires API key

## Acceptance Criteria

- [ ] Player can browse available models from host manifest (models/manifest.json)
- [ ] Player can download models with progress tracking and resume support
- [ ] Download integrity verified via SHA-256 checksum
- [ ] Models stored in browser IndexedDB with size management
- [ ] WASM inference engine loads GGUF models and runs inference in Web Worker
- [ ] Token streaming from WASM worker to UI in real-time
- [ ] llama.cpp tunnel connector via WebSocket with health check
- [ ] Auto-reconnect on tunnel failure
- [ ] Fallback to server default provider when tunnel unreachable
- [ ] Inference mode selector in settings (WASM / Tunnel / Server)
- [ ] Model management UI (download, delete, storage usage)
- [ ] Parameter tuning UI (temperature, context size, topP, topK, etc.)
- [ ] Connection status indicator
- [ ] Performance benchmark: WASM vs tunnel vs server
- [ ] Security audit: verify no model data leaks to server
- [ ] Unit tests for WASM inference engine
- [ ] Unit tests for tunnel connector and fallback
- [ ] Unit tests for model downloader and storage

## Notes

### Inference Mode Selection

```typescript
type InferenceMode = "wasm" | "tunnel" | "server";

interface InferenceConfig {
  mode: InferenceMode;
  localModel?: LocalModelConfig;
  tunnelConfig?: TunnelConfig;
  fallbackProvider?: string;
}
```

### Model Download Flow

```
Player selects model → download from host CDN → verify SHA-256 → store in IndexedDB → ready for inference
```

### WASM Engine

- llama.cpp compiled to WebAssembly (WASI target)
- Web Worker for non-blocking inference
- Streaming token output
- Memory limit enforcement (abort on OOM)

### Tunnel Connection

- WebSocket to local llama.cpp server
- Heartbeat/ping for liveness
- Auto-reconnect with exponential backoff
- Fallback to server default on persistent failure

### Related Files

- `src/inference/wasm-engine.ts` — WASM inference runner
- `src/inference/wasm-worker.ts` — Web Worker wrapper
- `src/inference/tunnel-connector.ts` — llama.cpp tunnel client
- `src/inference/fallback.ts` — fallback to server default
- `src/inference/model-downloader.ts` — download with resume + checksum
- `src/inference/model-storage.ts` — IndexedDB model storage
- `src/inference/manifest.ts` — model manifest fetching and parsing
- `src/db/schema-local-models.ts` — local model metadata schema
- `src/routes/models.ts` — model manifest API
- `src/frontend/settings/local-models.ts` — local models UI
- `src/frontend/settings/inference-mode.ts` — inference mode selector
