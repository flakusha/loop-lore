<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Chat-memory + moderation model survey (Llama-Guard, compactors)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

Adopt small models for chat memory + moderation domains. Grounded state: src/memory/extraction.ts routes summarization through callAux (auxiliary role, 2s timeout); src/generation/hooks/moderation-hook.ts is keyword-only (SEVERE_KEYWORDS word-boundary, no LLM consumer); chat moderation primitives in src/chat/moderation.ts are permission/audit only. Candidates: Llama-Guard-3-1B-GGUF (QuantFactory/mradermacher, smallest guard GGUF, generative policy verdict) vs Laya typed-decisions (mys/laya-typed-decisions-GGUF ggmlc full-model, calibrated choice/score/noul in one encoder pass, ~25ms/noul on RTX4050, NOT llama.cpp) for injection-guard/toxicity routing; Qwen3-Embedding-0.6B 32k ctx for compaction-window overflow. Scope: per-workflow pick (memory extract vs NSFW flag vs tox flag), wire guard verdict into moderation-hook alongside keyword path, eval vs 2s AUX timeout.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Moderation-hook LLM verdict wired alongside the keyword path via a new AUX task `moderation` (`MODERATION_PROMPT` JSON verdict: severe/moderate/clean + categories, 2s AUX timeout, temperature 0, fail-open). Escalation: keyword-moderate → LLM severe upgrades (suppress + `llmEscalated`); keyword-clean → LLM-only flagging (`llmOnly`); keyword-severe skips the LLM. Config: `hooks.enableModerationLlmClassifier` default true (`HOOKS_DEFAULTS`, env `MODERATION_LLM_CLASSIFIER`); the hook checks `=== true` so config-less contexts (`chat/moderation.ts applyFlag`) stay keyword-only. Model pick: the AUX JSON classifier is model-agnostic — any small instruct model on the auxiliary role works today; Llama-Guard speaks its own policy format (native-format adapter = follow-up) and Laya needs its external decision head, both covered by recipe entries + `docs/spec/integrations/llm-serving.md`. Qwen3-Embedding for compaction-window overflow rides the embed wiring in the RAG ticket.
