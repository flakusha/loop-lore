<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: BYOK Local Models (Bring Your Own Model)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** byok, local-models, wasm, inference, llama, browser, offline

## Summary

Players can download models and WASM modules to run inference locally in the browser, or connect to a local llama.cpp server via tunnel. This enables fully offline, privacy-preserving RPG sessions where the AI never leaves the player's machine. Community hosts can distribute model packs for their instance.

## Core Problems

### Privacy-Preserving Inference

- Some players want AI inference that never leaves their browser
- Server-side inference means prompts leave the local machine
- Local models eliminate data leakage risk entirely

### Offline Play

- RPG sessions should work without internet
- Local models enable fully offline play
- No dependency on external API availability

### Community Model Distribution

- Hosts can bundle recommended models with their instance
- Players can download model packs from the host
- WASM modules enable browser-native inference without native deps

### Performance Tradeoffs

- Browser WASM inference is slower than native
- Model size is constrained by browser memory
- Remote tunnel (llama.cpp) offers native speed with local privacy

## Design

### Three Inference Modes

```
┌─────────────────┐  ┌──────────────────────┐  ┌─────────────────────┐
│ Browser WASM    │  │ Local llama.cpp      │  │ Server Default      │
│ (self-contained)│  │ (remote tunnel)      │  │ (server-side API)   │
│                 │  │                      │  │                     │
│ - No network    │  │ - Native speed       │  │ - Best quality      │
│ - Full privacy  │  │ - Full privacy       │  │ - Requires API key  │
│ - Slower        │  │ - Requires llama.cpp │  │ - Key visible to    │
│ - Memory limit  │  │ - Player hosts       │  │   server operator   │
│   (~2-4GB)      │  │                      │  │                     │
└─────────────────┘  └──────────────────────┘  └─────────────────────┘
```

### Mode 1: Browser WASM Inference

- Models in GGUF format, loaded into browser memory
- WASM-based inference engine (e.g. `llama.cpp` compiled to WASM, or `onnxruntime-web`)
- Player downloads model files from host or CDN
- Models stored in browser IndexedDB (with size limits)
- Inference runs entirely client-side

```typescript
interface LocalModelConfig {
  modelId: string;
  modelUrl: string; // download source (host CDN or player URL)
  modelFormat: "gguf" | "onnx" | "wasm";
  parameters: {
    contextSize: number; // context window (tokens)
    temperature: number;
    topP: number;
    topK: number;
    repeatPenalty: number;
    threads: number; // WASM worker threads
  };
  memoryLimit: number; // max RAM in MB
  autoDownload: boolean; // auto-fetch from host on first use
}
```

### Mode 2: Local llama.cpp Tunnel

- Player runs `llama.cpp` server locally (or on LAN)
- Browser connects via WebSocket or SSE tunnel
- Full native inference speed
- No data leaves the player's network

```typescript
interface TunnelConfig {
  endpoint: string; // ws://localhost:8080 or tunnel URL
  modelPath: string; // local path to GGUF model
  apiKey?: string; // optional tunnel auth
  healthCheckInterval: number;
}
```

### Mode 3: Server Default (existing behavior)

- Unchanged — server uses its own API keys and providers
- Used when no local model is configured

### Model Discovery & Download

- Host publishes a `models/manifest.json` listing available models
- Player browses available models in settings
- Download progress tracked with resume support
- Checksum verification (SHA-256) after download
- Model metadata: name, size, quantization, recommended parameters

```json
{
  "models": [
    {
      "id": "llama3-8b-q4",
      "name": "Llama 3 8B Q4",
      "format": "gguf",
      "sizeMB": 4700,
      "url": "https://host.example.com/models/llama3-8b-q4.gguf",
      "sha256": "abc123...",
      "recommendedParams": {
        "contextSize": 4096,
        "temperature": 0.7,
        "topP": 0.9
      },
      "minMemoryMB": 3000
    }
  ]
}
```

### WASM Inference Engine

- Uses `llama.cpp` compiled to WebAssembly via `wasi` target
- Web Worker for non-blocking inference
- Streaming token output to UI
- Memory management: model loaded once, shared across sessions

### Tunnel Connection

- WebSocket connection to local llama.cpp server
- Heartbeat/ping to detect disconnect
- Auto-reconnect on tunnel failure
- Fallback to server default if tunnel unreachable

## Features

### Model Management

- Browse available models from host manifest
- Download models with progress tracking
- Verify downloads with checksum
- List downloaded models with size info
- Delete downloaded models to free space

### Inference Engine (WASM)

- Load GGUF model into browser memory
- Run inference via WASM worker
- Stream tokens to UI in real-time
- Respect memory limits (abort if OOM)
- Support common sampling parameters

### Tunnel Connection

- Connect to local llama.cpp server
- Health check on connect
- Auto-reconnect on failure
- Fallback to server default

### Settings UI

- Inference mode selector (WASM / Tunnel / Server)
- Model download and management panel
- Parameter tuning (temperature, context, etc.)
- Connection status indicator
- Storage usage display

## Tasks

- [ ] Design model manifest format and host publishing API
- [ ] Implement WASM inference engine (llama.cpp → WASM)
- [ ] Implement Web Worker wrapper for non-blocking inference
- [ ] Implement token streaming from WASM worker to UI
- [ ] Implement local model downloader with resume + checksum
- [ ] Implement model storage management (IndexedDB)
- [ ] Implement llama.cpp tunnel connector (WebSocket)
- [ ] Implement tunnel health check and auto-reconnect
- [ ] Implement fallback to server default provider
- [ ] Build model management settings UI
- [ ] Build inference parameter tuning UI
- [ ] Write tests for WASM inference engine
- [ ] Write tests for tunnel connector and fallback
- [ ] Write tests for model downloader and storage
- [ ] Performance benchmark: WASM vs tunnel vs server
- [ ] Security audit: verify no model data leaks to server

## Files

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
- `docs/spec/byok-local-models.md` — detailed spec

## References

- `epic-byok-api-keys.md` — API key management (tunnel auth)
- `epic-assistant-generation-extensions.md` — provider routing patterns
- `src/generation/` — existing generation pipeline
- `docs/spec/implementation.md` — implementation patterns
- `llama.cpp` WASM build docs — WASM compilation target
