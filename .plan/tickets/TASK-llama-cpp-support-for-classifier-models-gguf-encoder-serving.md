<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: llama.cpp support for classifier models (GGUF encoder serving)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-byok-local-models
**Summary:** Decide and document the llama.cpp/GGUF serving path for classifier models; Laya verdict resolved — two serving stories, pick one per deployment.
**Context:** Backbone-only GGUF via llama-server `--embeddings` (decision head out of band) vs full-model ggmlc `laya` CLI; details in ## Summary below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Scope: Laya verdict SUPERSEDED 2026-10-26 — llama.cpp now serves **native decision models** over `POST /v1/systemone` (llama.cpp PR #29818), so the "decision head runs outside llama.cpp" story is obsolete for the ggml-org GGUFs. A decision GGUF carries `<arch>.decision.*` metadata plus a `systemone` chat template; llama-server then answers typed `choice` / `score` / `noul` questions with probabilities and zero generated text. Native decision GGUFs: `ggml-org/Laya-GGUF`, `ggml-org/Julia-1-GGUF`, `ggml-org/Kev-4B-GGUF`, `ggml-org/lev-GGUF`, `ggml-org/OpenJev-GGUF`, `ggml-org/Clef-GGUF`. Measured locally (llama-swap `:7180`, `llama-d3-2b`): text `choice`+`noul` → 200 with per-option probabilities; `images` → 502 through the proxy; `videos` → 400 (`"videos" is not supported` upstream). The client work is tracked in `TASK-llama-cpp-decision-model-client-for-aux-classification.md`.

Prior (still valid for non-native builds): (1) llama.cpp backbone-only: fr0stbit3/laya-gguf + fr0stbit3/laya-multilingual-gguf (`-hf repo:Q8_0`, `--embeddings --pooling none`, loads as `modern-bert`); hidden states only — decision head (`laya-head.safetensors`, `load_head`) runs outside llama.cpp per that repo's quickstart.py; prefer F16/Q8_0. (2) ggmlc full-model: mys/laya-GGUF + mys/laya-multilingual-GGUF + mys/laya-typed-decisions-GGUF with the `laya` CLI (`laya serve file.gguf` → POST /api/decide; `daemon` = JSON-RPC) — backbone+head in one binary, FAILS in llama-server. Still open: ModernBERT/DeBERTa/MiniLM/bge-reranker GGUF verdicts, CPU sizing next to GPU LLM, latency vs 2s AUX timeout, per-model confidence calibration cutoffs.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
