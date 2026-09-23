<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: llama-swap native support: CPU-resident classifier model recipe

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

llama-swap native support for classifier models (Laya/Jev-class): add as CPU-resident model never offloaded, coexisting with GPU LLM rotation.

Grounded state:
- configs/config.llama-swap.example.yaml already documents group-engine mechanics: helpers group (swap:false, exclusive:false, persistent:true) coexists without eviction; per-model ttl:0 = never unload; preload via hooks.on_startup.preload.
- Auto-start schema (src/config/schema/auto-start.ts) only spawns the proxy (configPath) — models live in external llama-swap YAML, so NO code change needed for serving; this is config + docs work.
- Jev-analogue: remote integration pattern = openaiCompatible provider instance (src/generation/providers/registry.ts initializeProviders) pointed at remote endpoint; same seam serves a remote classifier.

Scope: DONE in configs/config.llama-swap.example.yaml — `laya-english` + `laya-multilingual` entries (fr0stbit3 GGUFs via `-hf`, `--embeddings --pooling none`, `-c/-ub/-b 2048`, `ttl: 0`, `unlisted: true`, members of the persistent `helpers` group). CPU is llama.cpp's default — no `-ngl` flag needed (earlier draft wrongly used `--n-gpu-layers 0`). Decision head is NOT in the GGUF (`laya-head.safetensors` + `laya_head.py` run outside llama.cpp). Remaining: verify proxy serves classifier + LLM concurrently (TTL must not evict).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
