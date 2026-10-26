<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: llama.cpp decision-model client for AUX classification

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-classifier-template-packs
**Related:** TASK-llama-cpp-support-for-classifier-models-gguf-encoder-serving.md, FEAT-classifier-model-support-complementary-to-aux-pipeline-laya-.md, src/aux-pipeline/runner.ts, src/aux-pipeline/template-registry.ts

**Summary:**

llama.cpp now ships native **decision models**: `llama-server` exposes `POST /v1/systemone` (llama.cpp PR #29818), the System One / Jev-compatible typed-decision API. This replaces the old "decision head runs outside llama.cpp" story for Laya-family GGUFs and gives the AUX pipeline a native, non-generative classifier transport.

## Endpoint contract (verified locally, 2026-10-26)

Request:

```json
{
  "model": "llama-d3-2b",
  "state": "Write a Python function that merges two sorted lists.",
  "questions": {
    "kind": { "type": "choice", "instructions": "What kind of work is this?",
              "criteria": { "code": "Writing or fixing code", "math": "Mathematics", "chat": "Anything else" } },
    "reasoning": { "type": "noul", "instructions": "Does answering this need multi-step reasoning?" }
  }
}
```

Response (no generated text — probabilities only):

```json
{
  "model": "ggml-org/vllm-d3-nano-GGUF:Q8_0",
  "answers": {
    "kind": { "type": "choice", "choice": "code",
              "probabilities": { "code": 0.9966, "math": 0.0003, "chat": 0.0030 },
              "confidence": 0.9786 },
    "reasoning": { "type": "noul", "noul": 0.0340 }
  },
  "usage": { "input_tokens": 213, "output_tokens": 0 }
}
```

Question types: `choice` (criteria map → pick + per-option probabilities + confidence), `score` (2–10 ordered levels → expected level + legend), `noul` (probability of yes).

## Measured against the local llama-swap proxy (`:7180`, model `llama-d3-2b`)

- text + `choice` + `noul` → **200**, one forward pass, `output_tokens: 0`.
- `images: ["data:image/png;base64,…"]` → **502** (proxy; vision works over `/v1/chat/completions` on the same model → 200).
- `videos: [...]` → **400** `"videos" is not supported` — the decision path has no video input upstream.

Upstream limits (llama.cpp): a GGUF without `<arch>.decision.*` metadata → **501** "This model is not a decision model"; a GGUF without a `systemone` chat template → load error; question+options must fit one batch (400 otherwise); LAYA-type models silently truncate options to their trained head budget.

## Scope (implementation upcoming)

TypeScript/Bun client for the decision endpoint, wired as the `ModelRole.Classifier` transport:

- New `src/aux-pipeline/decision-client.ts` — typed request/response for `choice` / `score` / `noul`, `data:` image payloads, strict response validation, per-question timeout + graceful `null` (same degradation contract as `callAux`).
- New `src/aux-pipeline/decision-registry.ts` — map `AuxTaskName` → question set (`criteria` from the existing `AUX_CLASSIFICATION_TASKS` labels, `instructions` from the task's default prompt purpose).
- Wire `callAux` to try the classifier transport when the classifier role resolves to a llama.cpp decision model; fall back to the generative auxiliary path on any failure (the existing `preferClassifier` → `auxiliary` fallback already carries the policy).
- Config: classifier base URL + decision model id (reuse the llama-swap endpoint convention; no new provider registry entry required until the transport is proven).

Non-goals for this ticket: video input (unsupported upstream), browser/transformers.js inference (`TASK-typescript-support-for-classifier-inference-transformers-js-.md`), and any change to the generative fallback semantics.

**Context:**

llama.cpp ships native decision models (PR #29818): `llama-server` answers typed `choice`/`score`/`noul` questions over `POST /v1/systemone`, returning probabilities with zero generated text — measured working against the local llama-swap proxy on 2026-10-26. The AUX pipeline's classifier role (`ModelRole.Classifier`, the `preferClassifier` tasks) has no dedicated transport today: a generative auxiliary LLM answers with parsed JSON instead. This ticket adds that transport. Alternatives rejected: transformers.js/ONNX server-side inference (`TASK-typescript-support-for-classifier-inference-transformers-js-.md` — needs a new runtime dependency) and a remote closed API (Jev — paid, data leaves the host).

**Acceptance Criteria:**

- [ ] Decision client implemented with typed `choice`/`score`/`noul` answers and validated probabilities
- [ ] At least one AUX task routes through the decision transport with an unchanged generative fallback
- [ ] Unit tests cover response parsing, unknown/501/400/502 degradation to `null`, and timeout
- [ ] Docs record the endpoint contract, upstream limits, and the measured local behaviour
