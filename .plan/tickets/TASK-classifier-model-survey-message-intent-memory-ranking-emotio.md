<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Classifier model survey: message/intent, memory ranking, emotion, toxicity

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Survey dedicated classifier/reranker models per workflow currently grounded in main/aux generative LLMs; deliverable is a per-workflow recommendation table filed as follow-up FEATs.
**Context:** Workflows: message-action/intent, memory extraction/inclusion ranking, emotion, toxicity/NSFW/injection-check — current grounding and candidates in ## Summary below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Survey dedicated classifier/reranker models per workflow currently grounded in main/aux generative LLMs.

Workflows + current grounding (src/):
- message-action/intent: src/routes/messages/ai-action.ts, src/generation/auto-gen/classify-intent.ts, src/assistant/gm-tool-detection.ts — all callAux generative.
- memory extraction/inclusion: src/memory/extraction.ts (AUX memory task), src/memory/budget.ts importance-sort + token budget, src/memory/provision.ts, src/memory/embeddings.ts (nomic-embed-text via embedDispatch, NO rerank stage).
- emotion: ideas only (docs/ideas/index.md Ax.Model/MiniLM + ONNX go-emotions ~28 labels) — loop-lore gap = embedding/LLM classifier + Emotion parse.
- toxicity/NSFW/injection: keyword scan + generative LLM fallback (nsfw-classifier.ts, prompt-injection.ts step 2).

Candidates to evaluate (fit per workflow, params, latency, license, GGUF/ONNX availability, llama-swap/llama.cpp/transformers.js path):
1. Laya family (convaiinnovations/laya, -multilingual, -typed-decisions): typed choice/score/noul, routing use, fine-tune notebook. Limits: zero-shot base weak, >20 options degrades.
2. TypeSafe Jev (remote API): 50+ options OOTB, soft-dist matching; closed + paid. Remote-integration pattern.
3. Cross-encoder rerankers for memory inclusion: BAAI/bge-reranker-base/v2-m3, MiniLM-L6-v2 (ms-marco), jina-reranker — bi-encoder shortlist (existing nomic-embed-text) then cross-encoder rescore top-k.
4. Small fine-tunable encoders per workflow: ModernBERT-base/large, DeBERTa-v3-small/base, MiniLM — intent, emotion (go-emotions/SST-style), toxicity (unitary/toxic-bert, Detoxify).
5. Zero-shot NLI fallback: bart-large-mnli / mDeBERTa-xnli — open label sets without retrain, CPU-cheap.

Deliverable: per-workflow recommendation table (model, why, serving path, fallback), filed as follow-up FEATs.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
