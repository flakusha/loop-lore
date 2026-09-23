<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: llama.cpp support for classifier models (GGUF encoder serving)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Scope: Laya verdict RESOLVED — two serving stories, pick one per deployment (not both): (1) llama.cpp: fr0stbit3/laya-gguf + fr0stbit3/laya-multilingual-gguf (`-hf repo:Q8_0`, `--embeddings --pooling none`, loads as `modern-bert`); backbone hidden states only — decision head (`laya-head.safetensors`, `load_head`) runs outside llama.cpp per that repo's quickstart.py; prefer F16/Q8_0. (2) ggmlc full-model: mys/laya-GGUF + mys/laya-multilingual-GGUF + mys/laya-typed-decisions-GGUF with the `laya` CLI (`laya serve file.gguf` → POST /api/decide; `daemon` = JSON-RPC) — backbone+head in one binary, FAILS in llama-server. Still open: ModernBERT/DeBERTa/MiniLM/bge-reranker GGUF verdicts, CPU sizing next to GPU LLM, latency vs 2s AUX timeout.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
