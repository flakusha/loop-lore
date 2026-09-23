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

Scope: extend config.llama-swap.example.yaml with a classifier entry (CPU-only llama-server cmd: --n-gpu-layers 0, small ctx 4-16k, ttl:0, member of persistent helpers group), document VRAM reasoning (421M encoder ~1GB, stays resident while 7B+ LLMs rotate), note preload-all cost vs lazy. Verify: proxy serves classifier + LLM concurrently, TTL does not evict classifier.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
