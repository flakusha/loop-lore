<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: llama-swap recipe: embed + rerank + guard helpers + comfyui_auto

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

Extend configs/config.llama-swap.example.yaml with the full helper set from the survey tickets. Grounded state: recipe currently has placeholder main/secondary/background models + group-engine docs (llm-rotation swap+exclusive, helpers persistent); classifier-support branch adds laya-english + laya-multilingual (fr0stbit3 -hf, --embeddings --pooling none, ttl 0) — merge/rebase onto it, do not fork. Entries: qwen3-embed-0.6B (-hf Qwen/Qwen3-Embedding-0.6B-GGUF:Q8_0, --embedding --pooling last, -ub 8192, ttl 0, unlisted), bge-reranker-v2-m3 (-hf gpustack/bge-reranker-v2-m3-GGUF, --pooling rank, ttl 0, unlisted), llama-guard-3-1b (generative chat endpoint, ttl 0, unlisted, llm-rotation-excluded), comfyui_auto (cmd: python main.py --port, workarounds.ignoreWebsockets true, ttl 0) — all persistent helpers members. Verify: YAML parses (js-yaml), proxy serves embed+rerank+LLM concurrently, /comfyui routes to comfyui_auto.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
