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
**Caveats:** TOCTOU — the serving verdict depends on which GGUF is loaded at request time, and a GGUF swapped under a running llama-server keeps serving the old weights until restart, so a documented verdict can describe a model that is no longer resident (ruled out: the ticket records verdicts per model id and the deployment recipe pins the served model id); partial failure — a GGUF without `<arch>.decision.*` metadata loads but answers 501, and one without a `systemone` chat template throws at load, so a wrong file breaks serving rather than degrading (ruled out: the verdict table records the metadata and template requirement per model, and the client degrades a 501 to `null`); rollback — a classifier served from the same llama-server as the main LLM competes for the same memory budget, so a classifier deployment that starves the LLM must be revertible to LLM-only serving (ruled out: the serving path is per-deployment config, so reverting is a config change with no data migration); stale state — CPU sizing, latency and per-model confidence cutoffs are measured per quantization and drift when the GGUF changes (ruled out: the ticket lists them as still-open measurement items rather than settled numbers, and cutoffs are configured per model id); observability — a load-time throw surfaces as a server startup failure, not a per-request status, so the cause is invisible without reading llama-server's log (ruled out: the recipe pins the exact error strings the operator should expect); security — llama-server's decision endpoint is unauthenticated and must stay on loopback (ruled out: the classifier serves locally only, no remote exposure); authorization, parallelism, lock/unlock lifecycle, data races and idempotency — not applicable to a read-only serving verdict (ruled out: no writes, no locks, no shared mutable state).

## Summary

Scope: Laya verdict SUPERSEDED 2026-10-26 — llama.cpp now serves **native decision models** over `POST /v1/systemone` (llama.cpp PR #29818), so the "decision head runs outside llama.cpp" story is obsolete for the ggml-org GGUFs. A decision GGUF carries `<arch>.decision.*` metadata plus a `systemone` chat template; llama-server then answers typed `choice` / `score` / `noul` questions with probabilities and zero generated text. Native decision GGUFs: `ggml-org/Laya-GGUF`, `ggml-org/Julia-1-GGUF`, `ggml-org/Kev-4B-GGUF`, `ggml-org/lev-GGUF`, `ggml-org/OpenJev-GGUF`, `ggml-org/Clef-GGUF`. Measured locally (llama-swap `:7180`, `llama-d3-2b`): text `choice`+`noul` → 200 with per-option probabilities; `images` → 502 through the proxy (upstream contract is 501 when the model lacks image support or no multimodal projector is loaded); `videos` → 400 (`"videos" is not supported` upstream). The client work is tracked in `TASK-llama-cpp-decision-model-client-for-aux-classification.md`.

Prior (still valid for non-native builds): (1) llama.cpp backbone-only: fr0stbit3/laya-gguf + fr0stbit3/laya-multilingual-gguf (`-hf repo:Q8_0`, `--embeddings --pooling none`, loads as `modern-bert`); hidden states only — decision head (`laya-head.safetensors`, `load_head`) runs outside llama.cpp per that repo's quickstart.py; prefer F16/Q8_0. (2) ggmlc full-model: mys/laya-GGUF + mys/laya-multilingual-GGUF + mys/laya-typed-decisions-GGUF with the `laya` CLI (`laya serve file.gguf` → POST /api/decide; `daemon` = JSON-RPC) — backbone+head in one binary, FAILS in llama-server. Still open: ModernBERT/DeBERTa/MiniLM/bge-reranker GGUF verdicts, CPU sizing next to GPU LLM, latency vs 2s AUX timeout, per-model confidence calibration cutoffs.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
