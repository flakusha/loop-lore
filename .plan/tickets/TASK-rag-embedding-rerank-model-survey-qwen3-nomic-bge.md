<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: RAG embedding + rerank model survey (Qwen3, nomic, bge)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Research + adopt embedding/rerank GGUFs for chat memory RAG. Grounded state: src/memory/embeddings.ts hardcodes Ollama nomic-embed-text via embedDispatch to OLLAMA_BASE_URL; llama.cpp serves embeddings natively (Qwen/Qwen3-Embedding-0.6B-GGUF official: -hf Qwen/Qwen3-Embedding-0.6B-GGUF:Q8_0, --embedding --pooling last, 32k ctx, 1024 dims, MRL 32-1024; nomic-ai/nomic-embed-text-v1.5-GGUF llama.cpp-compatible; llama-swap proxies /v1/embeddings + /rerank|/v1/rerank|/v1/reranking with --pooling rank (gpustack/bge-reranker-v2-m3-GGUF 0.6B most-pulled). Qwen3-Reranker-0.6B/4B/8B series exists (GGUF availability unverified). Scope: swap recipe entries for embed + rerank helpers (ttl 0, persistent group), configurable embed model name (kill hardcoded nomic string), rerank stage in semanticRecall or new history-search path, latency vs recall path.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
